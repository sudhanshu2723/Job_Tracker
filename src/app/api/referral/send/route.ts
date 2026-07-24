import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PDF_B64 = 12_000_000;
const MAX_RECIPIENTS = 20; // per send: respects Gmail limits + keeps within the timeout
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Recipient = { name: string; email: string };

// POST /api/referral/send
// { gmailUser, gmailPass, subject, body, recipients[], pdfBase64?, filename? }
// The Gmail App Password is used transiently for this request only — never stored or logged.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Cap how often a user can fire a batch.
  const limited = await enforceRateLimit(req, "referral-send", 8, 3600, session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const gmailUser = String(body?.gmailUser ?? "").trim();
  const gmailPass = String(body?.gmailPass ?? "").replace(/\s+/g, ""); // app passwords are shown with spaces
  const subject = String(body?.subject ?? "").trim();
  const emailBody = String(body?.body ?? "");
  const pdfBase64 = String(body?.pdfBase64 ?? "");
  const filename = (String(body?.filename ?? "resume.pdf").replace(/[^\w.\-]+/g, "_") || "resume.pdf").slice(0, 80);
  const rawRecipients = Array.isArray(body?.recipients) ? body.recipients : [];

  if (!EMAIL_RE.test(gmailUser)) return NextResponse.json({ error: "Enter a valid Gmail address." }, { status: 400 });
  if (gmailPass.length < 12) return NextResponse.json({ error: "Enter your 16-character Gmail App Password." }, { status: 400 });
  if (!subject || emailBody.trim().length < 20) return NextResponse.json({ error: "Draft the email first." }, { status: 400 });
  if (pdfBase64 && pdfBase64.length > MAX_PDF_B64) return NextResponse.json({ error: "Résumé attachment too large." }, { status: 400 });

  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  for (const r of rawRecipients) {
    const email = String(r?.email ?? "").trim().toLowerCase();
    const name = String(r?.name ?? "").trim();
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push({ name, email });
  }
  if (!recipients.length) return NextResponse.json({ error: "Add at least one valid recipient." }, { status: 400 });
  if (recipients.length > MAX_RECIPIENTS)
    return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per send. Split the list.` }, { status: 400 });

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });
  try {
    await transporter.verify();
  } catch {
    return NextResponse.json({ error: "Gmail sign-in failed. Check the address and App Password (needs 2-Step Verification on)." }, { status: 400 });
  }

  const attachments = pdfBase64 ? [{ filename, content: Buffer.from(pdfBase64, "base64"), contentType: "application/pdf" }] : undefined;
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const r of recipients) {
    const first = r.name.split(/\s+/)[0] || "there";
    const text = emailBody
      .replace(/\{\{\s*name\s*\}\}/gi, first)
      .replace(/\{\{\s*my_?email\s*\}\}/gi, gmailUser);
    try {
      await transporter.sendMail({ from: gmailUser, to: r.email, subject, text, attachments });
      results.push({ email: r.email, ok: true });
    } catch (err) {
      results.push({ email: r.email, ok: false, error: (err instanceof Error ? err.message : "send failed").slice(0, 120) });
    }
  }
  transporter.close();

  const sent = results.filter((r) => r.ok).length;
  return NextResponse.json({ sent, failed: results.length - sent, results });
}
