import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { analyzeResume } from "@/lib/pdfEdit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PDF_B64 = 12_000_000;
const MAX_JD = 25_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string", description: "A short, specific subject line (no 'Re:', no emoji)." },
    body: { type: "string", description: "The plain-text email body." },
  },
  required: ["subject", "body"],
} as const;

const SYSTEM = [
  "You write a professional, courteous referral-request email from a job seeker to someone who works at the target company. Tone: warm but businesslike — measured, no exclamation-mark overload, no gushing, no buzzword soup. It should read like a polished professional wrote it.",
  "Follow this STRUCTURE EXACTLY:",
  "  • First line: 'Hi {{name}},' then a blank line. ({{name}} is a literal placeholder — never a real name.)",
  "  • Then EXACTLY THREE paragraphs, each SEPARATED BY A BLANK LINE:",
  "     Paragraph 1 — briefly introduce yourself and your interest in the specific role at the company; mention one or two concrete, genuine reasons you're a fit, drawn from the resume. Do NOT put the job link here.",
  "     Paragraph 2 — politely ask whether they'd be willing to refer you for this role, and tell them they can use your email to refer you written as the literal placeholder {{my_email}}. Then include this sentence VERBATIM, replacing [Insert Job Link] with the actual bare JOB LINK url: 'I have attached my resume for your review, and here is the link to the job posting for your reference: [Insert Job Link].' (If no JOB LINK was provided, instead write just: 'I have attached my resume for your review.')",
  "     Paragraph 3 — a brief, professional thank-you.",
  "  • Then a blank line, then EXACTLY these two lines (nothing after):",
  "     Thanks & Regards,",
  "     <the candidate's real full name, taken from the resume>",
  "Use ONLY the placeholders {{name}} and {{my_email}} — no others. Keep the three paragraphs to ~120–180 words total. Plain text only — no markdown, no bullet lists, no quotation marks around the link.",
].join("\n");

// POST /api/referral/draft { pdfBase64, jd, company } -> { subject, body }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = await enforceRateLimit(req, "referral-draft", 30, 3600, session.userId);
  if (limited) return limited;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Email drafting isn't configured — OPENAI_API_KEY is missing." }, { status: 501 });

  const body = await req.json().catch(() => null);
  const pdfBase64 = String(body?.pdfBase64 ?? "");
  const jd = String(body?.jd ?? "").slice(0, MAX_JD);
  const company = String(body?.company ?? "").slice(0, 200).trim();
  const jobLink = String(body?.jobLink ?? "").slice(0, 500).trim();
  if (!pdfBase64 || pdfBase64.length > MAX_PDF_B64)
    return NextResponse.json({ error: "Upload your resume PDF (max ~9 MB)." }, { status: 400 });
  if (jd.trim().length < 40) return NextResponse.json({ error: "Paste the job description." }, { status: 400 });

  let resumeText = "";
  try {
    resumeText = (await analyzeResume(Uint8Array.from(Buffer.from(pdfBase64, "base64")))).text;
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF." }, { status: 400 });
  }
  if (resumeText.trim().length < 80)
    return NextResponse.json({ error: "Couldn't extract enough text — is this a text-based PDF?" }, { status: 400 });

  const userMsg = [
    company ? `TARGET COMPANY: ${company}` : "",
    jobLink ? `JOB LINK: ${jobLink}` : "",
    `JOB DESCRIPTION:\n${jd}`,
    `\nCANDIDATE RESUME:\n${resumeText}`.slice(0, 16_000),
    "\nWrite the referral-request email (subject + body). The body must start with 'Hi {{name}},', include the job link if given, and include the {{my_email}} line.",
  ].filter(Boolean).join("\n");

  let ai: Response;
  try {
    ai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESUME_MODEL || "gpt-4o",
        temperature: 0.6,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_schema", json_schema: { name: "referral_email", strict: true, schema: SCHEMA } },
      }),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the AI service." }, { status: 502 });
  }
  if (!ai.ok) return NextResponse.json({ error: "AI request failed.", detail: (await ai.text()).slice(0, 300) }, { status: 502 });

  const data = await ai.json();
  let parsed: { subject?: string; body?: string };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "AI returned an unreadable response." }, { status: 502 });
  }

  return NextResponse.json({ subject: (parsed.subject ?? "").trim(), body: (parsed.body ?? "").trim() });
}
