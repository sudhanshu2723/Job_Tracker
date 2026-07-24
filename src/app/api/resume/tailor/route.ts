import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { analyzeResume, applyEdits, isProtectedSection, type PdfOp } from "@/lib/pdfEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PDF_B64 = 12_000_000;
const MAX_JD = 25_000;

// The whole resume is sent line-by-line; the model identifies the skills lines
// and project descriptions itself and returns edits by ID.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    keywords: { type: "array", items: { type: "string" }, description: "All JD hard-skill keywords, most important first." },
    missing: { type: "array", items: { type: "string" }, description: "Which of those are NOT already in the resume." },
    appends: {
      type: "array",
      description: "Append one keyword to the end of a SKILLS line that has room.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lineId: { type: "string", description: "The line id, e.g. 'L23'." },
          keyword: { type: "string", description: "The single JD keyword to append." },
        },
        required: ["lineId", "keyword"],
      },
    },
    rewrites: {
      type: "array",
      description: "Rewrite a FULL skills line (no room left) to swap its least-relevant items for JD keywords, same length.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lineId: { type: "string", description: "The line id." },
          newText: { type: "string", description: "The whole line rewritten, ABOUT THE SAME LENGTH, keeping the category label and most items, dropping only 1–3 least-relevant items for JD keywords." },
          label: { type: "string", description: "The line's leading category label (e.g. 'Languages', 'Core Competencies') so it stays bold — must be the exact start of newText. '' if none." },
        },
        required: ["lineId", "newText", "label"],
      },
    },
    bulletRewrites: {
      type: "array",
      description: "Rewrite a PROJECT description bullet to weave in JD keywords, same length.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          bulletId: { type: "string", description: "The bullet id, e.g. 'B4'." },
          rewrite: { type: "string", description: "The whole bullet rewritten, ABOUT THE SAME LENGTH, weaving in relevant JD keywords while keeping every existing fact/tool and the original meaning." },
        },
        required: ["bulletId", "rewrite"],
      },
    },
  },
  required: ["keywords", "missing", "appends", "rewrites", "bulletRewrites"],
} as const;

const SYSTEM = [
  "You tailor a resume to a job description by adding its missing hard-skill keywords. You are given the ENTIRE resume as numbered lines (L#) with each line's spare-character room, plus its bullet points (B#). YOU decide which lines are the technical-skills lines and which bullets are PROJECT descriptions — do not assume any particular headings or wording.",
  "Edit ONLY: (a) the skills-section lines, and (b) bullets that are PROJECT descriptions. NEVER edit education, work experience, achievements, positions, contact info, or their bullets.",
  "The user will back up each keyword later, so you need not verify it — just place keywords so the resume still reads cleanly. BE THOROUGH: add EVERY JD keyword that is a technology, tool, method, or hard skill and is not already present — usually 15–40 additions plus several bullet rewrites.",
  "",
  "How to place each missing keyword:",
  "• If a relevant SKILLS line has enough spare room → `appends`: {lineId, keyword}. One keyword per entry; you may send several to the same line (they fill until the room runs out). Prefer the most relevant skills line that has room.",
  "• If the best skills line is FULL (room ~0) → `rewrites`: {lineId, newText, label} — rewrite it about the same length, dropping only its 1–3 least-relevant items to make space; keep the category label (put it in `label`) and all other items.",
  "• For PROJECT description bullets → `bulletRewrites`: {bulletId, rewrite} — rewrite the whole bullet about the same length, weaving in relevant keywords, keeping every fact/tool and the meaning. Do 3–8 of these.",
  "",
  "Rules: never duplicate a keyword already anywhere in the resume; keep everything grammatical (never end on a dangling word); never invent metrics or swap a tool's purpose; process keywords in priority order (most important first) so the key ones land before room runs out.",
].join("\n");

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = await enforceRateLimit(req, "resume-tailor", 40, 3600, session.userId);
  if (limited) return limited;

  const key = process.env.OPENAI_API_KEY;
  if (!key)
    return NextResponse.json({ error: "Resume tailoring isn't configured — OPENAI_API_KEY is missing on the server." }, { status: 501 });

  const body = await req.json().catch(() => null);
  const pdfBase64 = String(body?.pdfBase64 ?? "");
  const jd = String(body?.jd ?? "").slice(0, MAX_JD);
  if (!pdfBase64 || pdfBase64.length > MAX_PDF_B64)
    return NextResponse.json({ error: "Upload a resume PDF (max ~9 MB)." }, { status: 400 });
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

  // ID-referenced view of the whole resume.
  const lineMap = new Map<string, { find: string; label: string; section: string }>();
  const bulletMap = new Map<string, { find: string; section: string }>();
  const lineBlock = parts.lines.map((l, i) => { const id = `L${i + 1}`; lineMap.set(id, { find: l.find, label: l.label, section: l.section }); return `${id} (room ${l.room}): ${l.find}`; });
  const bulletBlock = parts.bullets.map((b, i) => { const id = `B${i + 1}`; bulletMap.set(id, { find: b.find, section: b.section }); return `${id} (~${b.chars} chars): ${b.text}`; });

  const userMsg = [
    `JOB DESCRIPTION:\n${jd}`,
    "",
    "RESUME LINES (id, spare room, text):",
    lineBlock.join("\n"),
    "",
    "BULLET POINTS (id, length, text):",
    bulletBlock.join("\n") || "(none)",
  ].join("\n").slice(0, 40_000);

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
    appends?: { lineId: string; keyword: string }[];
    rewrites?: { lineId: string; newText: string; label: string }[];
    bulletRewrites?: { bulletId: string; rewrite: string }[];
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

  const ops: PdfOp[] = [];
  const meta: { section: string; keyword: string; detail: string }[] = [];

  // Safety net: never edit a line/bullet the parser places in a protected
  // section (work experience, education, achievements, …), even if the AI picked it.
  const lid = (id: string) => lineMap.get(String(id).trim().toUpperCase());
  for (const e of parsed.appends ?? []) {
    const L = lid(e.lineId);
    const kw = String(e.keyword ?? "").trim();
    if (!L || !kw || present(kw) || isProtectedSection(L.section)) continue;
    ops.push({ kind: "append", find: L.find, text: `, ${kw}` });
    meta.push({ section: "Skills", keyword: kw, detail: `added to “${(L.label || L.find).slice(0, 26)}”` });
  }
  for (const e of parsed.rewrites ?? []) {
    const L = lid(e.lineId);
    const newText = String(e.newText ?? "").trim();
    if (!L || newText.length < 8 || danglingRe.test(newText) || isProtectedSection(L.section)) continue;
    const label = String(e.label ?? "").trim() || L.label;
    ops.push({ kind: "line", find: L.find, text: newText, boldPrefix: label && newText.startsWith(label) ? label : undefined });
    meta.push({ section: "Skills", keyword: "", detail: `reworded → “${newText.slice(0, 80)}”` });
  }
  for (const e of parsed.bulletRewrites ?? []) {
    const b = bulletMap.get(String(e.bulletId).trim().toUpperCase());
    const rewrite = String(e.rewrite ?? "").trim();
    if (!b || rewrite.length < 20 || danglingRe.test(rewrite) || isProtectedSection(b.section)) continue;
    ops.push({ kind: "bullet", find: b.find, text: rewrite });
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
