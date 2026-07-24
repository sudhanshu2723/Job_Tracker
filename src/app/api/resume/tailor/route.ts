import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { analyzeResume, applyEdits, type PdfOp } from "@/lib/pdfEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PDF_B64 = 12_000_000;
const MAX_JD = 25_000;

// The model references résumé parts by ID and returns keyword placements.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keywords: { type: "array", items: { type: "string" }, description: "All JD hard-skill keywords, most important first." },
    missing: { type: "array", items: { type: "string" }, description: "Which of those are NOT already in the résumé." },
    skillEdits: {
      type: "array",
      description: "Add one JD keyword to a skills/tech line (by id).",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "The line id, e.g. 'S2' or 'T1'." },
          keyword: { type: "string", description: "The single JD keyword to add to that line." },
          swapOut: { type: "string", description: "Only if that line is full (spare ~0): the EXACT least-relevant existing item on it to drop to make room; else ''." },
        },
        required: ["id", "keyword", "swapOut"],
      },
    },
    descEdits: {
      type: "array",
      description: "Rewrite a project description bullet (by id) to weave in JD keywords, same length.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "The bullet id, e.g. 'B1'." },
          rewrite: { type: "string", description: "The whole bullet rewritten, ABOUT THE SAME LENGTH as the original, weaving in relevant JD keywords while keeping every existing fact/tool and the original meaning." },
        },
        required: ["id", "rewrite"],
      },
    },
  },
  required: ["keywords", "missing", "skillEdits", "descEdits"],
} as const;

const SYSTEM = [
  "You tailor a résumé to a job description by adding the JD's missing hard-skill keywords, editing ONLY the skills and project sections given. The user will back up each keyword later, so you need not verify it — just place keywords so the résumé still reads cleanly.",
  "BE THOROUGH: add EVERY JD keyword that is a technology, tool, method, framework, or hard skill and is NOT already present. That is usually 15–40 additions across the skill lines, plus rewrites of several description bullets. Do not stop after a few.",
  "",
  "You are given, with IDs:",
  "• SKILL LINES (S#) — each with its spare-character room. Put each keyword under the MOST RELEVANT category line that has room, and fill that room. Only fall back to a general line (e.g. Languages) if no relevant line has space. One keyword per skillEdit. Only if the best line has ~0 spare, set `swapOut` to the least-relevant existing item to drop — but drop only 1–3 items per line at most; NEVER strip a line's core/primary skills.",
  "• TECH LINES (T#) — project title/stack lines you may also append keywords to (same rules).",
  "• DESCRIPTION BULLETS (B#) — for 3–8 bullets, return a `rewrite`: the WHOLE bullet rewritten to ABOUT THE SAME LENGTH (±10%), weaving in relevant JD keywords while keeping every existing fact/tool and the original meaning. Never invent metrics; never swap a tool's purpose; never end on a dangling word.",
  "",
  "Put each keyword under the most relevant line/bullet. Never add a keyword that already appears anywhere in the résumé. Prioritise the most important JD keywords first (so if room runs out, the key ones are already placed).",
].join("\n");

// POST /api/resume/tailor  { pdfBase64, jd } -> { editedPdfBase64, edits[], keywords[], missing[] }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = await enforceRateLimit(req, "resume-tailor", 40, 3600, session.userId);
  if (limited) return limited;

  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return NextResponse.json({ error: "Résumé tailoring isn't configured — OPENAI_API_KEY is missing on the server." }, { status: 501 });

  const body = await req.json().catch(() => null);
  const pdfBase64 = String(body?.pdfBase64 ?? "");
  const jd = String(body?.jd ?? "").slice(0, MAX_JD);
  if (!pdfBase64 || pdfBase64.length > MAX_PDF_B64)
    return NextResponse.json({ error: "Upload a résumé PDF (max ~9 MB)." }, { status: 400 });
  if (jd.trim().length < 40)
    return NextResponse.json({ error: "Paste the full job description." }, { status: 400 });

  const pdfBytes = Uint8Array.from(Buffer.from(pdfBase64, "base64"));
  let parts: Awaited<ReturnType<typeof analyzeResume>>;
  try {
    parts = await analyzeResume(pdfBytes);
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF." }, { status: 400 });
  }
  if (parts.text.trim().length < 80)
    return NextResponse.json({ error: "Couldn't extract enough text — is this a text-based PDF?" }, { status: 400 });

  // Build the ID-referenced résumé view for the model.
  const skillMap = new Map<string, string>(); // id -> line find text
  const bulletMap = new Map<string, string>(); // id -> bullet find text
  const skillsBlock = parts.skillLines.map((l, i) => { const id = `S${i + 1}`; skillMap.set(id, l.find); return `${id} (spare ~${l.spare} chars): ${l.find}`; });
  const techBlock = parts.techLines.map((l, i) => { const id = `T${i + 1}`; skillMap.set(id, l.find); return `${id} (spare ~${l.spare} chars): ${l.find}`; });
  const bulletBlock = parts.bullets.map((b, i) => { const id = `B${i + 1}`; bulletMap.set(id, b.find); return `${id} (~${b.chars} chars): ${b.text}`; });

  const userMsg = [
    `JOB DESCRIPTION:\n${jd}`,
    "",
    "SKILL LINES:",
    skillsBlock.join("\n") || "(none)",
    "",
    "TECH LINES (project title / stack):",
    techBlock.join("\n") || "(none)",
    "",
    "DESCRIPTION BULLETS:",
    bulletBlock.join("\n") || "(none)",
  ].join("\n").slice(0, 24_000);

  let ai: Response;
  try {
    ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESUME_MODEL || "gpt-4o",
        temperature: 0.2,
        max_tokens: 8000,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_schema", json_schema: { name: "resume_tailor", strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI service." }, { status: 502 });
  }
  if (!ai.ok) {
    const detail = (await ai.text()).slice(0, 300);
    return NextResponse.json({ error: "AI request failed.", detail }, { status: 502 });
  }

  const data = await ai.json();
  let parsed: {
    keywords?: string[];
    missing?: string[];
    skillEdits?: { id: string; keyword: string; swapOut: string }[];
    descEdits?: { id: string; rewrite: string }[];
  };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "AI returned an unreadable response." }, { status: 502 });
  }

  const resumeLower = parts.text.toLowerCase();
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const present = (k: string) => !!k && new RegExp(`(^|[^a-z0-9])${escapeRe(k.toLowerCase())}([^a-z0-9]|$)`).test(resumeLower);
  const danglingRe = /\b(and|or|with|using|for|to|the|a|an|of|in|on|via)\s*[.,;]?\s*$/i;

  // ── build PDF operations ──────────────────────────────────────────────────
  const ops: PdfOp[] = [];
  const meta: { section: string; keyword: string; detail: string }[] = [];

  // Skills: appends to lines with room; per-line consolidation of swap-outs.
  const parseSkill = (t: string) => { const i = t.indexOf(": "); return i < 0 ? { label: "", skills: t.split(",").map((s) => s.trim()).filter(Boolean) } : { label: t.slice(0, i), skills: t.slice(i + 2).split(",").map((s) => s.trim()).filter(Boolean) }; };
  // cross-line duplicate detection for extra room when swapping.
  const tokCount = new Map<string, number>();
  const owner = new Map<string, string>();
  for (const l of parts.skillLines) for (const s of new Set(parseSkill(l.find).skills.map((x) => x.toLowerCase()))) { tokCount.set(s, (tokCount.get(s) ?? 0) + 1); if (!owner.has(s)) owner.set(s, l.find); }

  const swapByLine = new Map<string, { kws: string[]; drop: Set<string> }>();
  for (const e of parsed.skillEdits ?? []) {
    const find = skillMap.get(String(e.id).trim().toUpperCase());
    const kw = String(e.keyword ?? "").trim();
    if (!find || !kw || present(kw)) continue;
    if (e.swapOut && e.swapOut.trim()) {
      const g = swapByLine.get(find) ?? { kws: [], drop: new Set<string>() };
      if (!g.kws.some((k) => k.toLowerCase() === kw.toLowerCase())) g.kws.push(kw);
      g.drop.add(e.swapOut.trim().toLowerCase());
      swapByLine.set(find, g);
    } else {
      ops.push({ kind: "append", find, text: `, ${kw}` });
      meta.push({ section: "Skills", keyword: kw, detail: `added to “${parseSkill(find).label || find.slice(0, 24)}”` });
    }
  }
  for (const [find, { kws, drop }] of swapByLine) {
    const { label, skills } = parseSkill(find);
    if (!label) continue;
    // Never gut a line: drop at most ~1/3 of its skills, and add that many keywords.
    const maxSwap = Math.max(1, Math.floor(skills.length / 3));
    // Prefer dropping cross-line duplicates, then the model's flagged skills.
    const dupDrops = skills.filter((s) => { const k = s.toLowerCase(); return (tokCount.get(k) ?? 0) >= 2 && owner.get(k) !== find; }).map((s) => s.toLowerCase());
    const dropOrder = [...new Set([...dupDrops, ...drop])].slice(0, maxSwap);
    const addKws = kws.slice(0, dropOrder.length);
    if (!addKws.length) continue;
    const dropSet = new Set(dropOrder);
    const kept = skills.filter((s) => !dropSet.has(s.toLowerCase()));
    ops.push({ kind: "line", find, text: `${label}: ${[...kept, ...addKws].join(", ")}`, boldPrefix: `${label}:` });
    meta.push({ section: "Skills", keyword: addKws.join(", "), detail: `swapped ${dropOrder.join(", ")} → ${addKws.join(", ")}` });
  }

  // Descriptions: whole-bullet rewrites.
  for (const e of parsed.descEdits ?? []) {
    const find = bulletMap.get(String(e.id).trim().toUpperCase());
    const rewrite = String(e.rewrite ?? "").trim();
    if (!find || rewrite.length < 20 || danglingRe.test(rewrite)) continue;
    ops.push({ kind: "bullet", find, text: rewrite });
    meta.push({ section: "Projects", keyword: "", detail: rewrite });
  }

  let editedBytes: Uint8Array;
  let applied: boolean[];
  try {
    ({ pdf: editedBytes, applied } = await applyEdits(pdfBytes, ops));
  } catch (err) {
    return NextResponse.json({ error: "Couldn't write the edits into the PDF.", detail: String(err).slice(0, 200) }, { status: 500 });
  }

  const edits = meta.map((m, i) => ({ ...m, applied: !!applied[i] }));

  return NextResponse.json({
    editedPdfBase64: Buffer.from(editedBytes).toString("base64"),
    edits,
    keywords: (parsed.keywords ?? []).map((k) => String(k).trim()).filter(Boolean),
    missing: (parsed.missing ?? []).map((k) => String(k).trim()).filter(Boolean),
  });
}
