"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";
import { IconArrowLeft } from "./icons";

interface Recipient { name: string; email: string }
interface SendResult { email: string; ok: boolean; error?: string }

async function fileToBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const EMAIL_RE = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/;

// Turn spreadsheet rows (array-of-arrays) into "Name, email" lines. For each row
// it finds the email cell and uses the first other text cell as the name.
function rowsToLines(rows: unknown[][]): string[] {
  const lines: string[] = [];
  for (const row of rows) {
    const cells = (row ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
    const emailCell = cells.find((c) => EMAIL_RE.test(c));
    if (!emailCell) continue; // header / empty row
    const email = emailCell.match(EMAIL_RE)![0];
    const name = cells.find((c) => c !== emailCell && !EMAIL_RE.test(c)) ?? "";
    lines.push(`${name}, ${email}`.trim());
  }
  return lines;
}

function parseRecipients(text: string): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(EMAIL_RE);
    if (!m) continue;
    const email = m[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    const name = t.replace(m[0], "").replace(/[<>,;]/g, " ").replace(/\s+/g, " ").trim();
    out.push({ name, email });
  }
  return out;
}

export default function ReferralComposer({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [pdfB64, setPdfB64] = useState("");
  const [jd, setJd] = useState("");
  const [company, setCompany] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [gmailUser, setGmailUser] = useState("");
  const [gmailPass, setGmailPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);

  const recipients = useMemo(() => parseRecipients(recipientsText), [recipientsText]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return toast("Please upload a PDF resume.", "error");
    setFileName(f.name);
    setPdfB64(await fileToBase64(f));
  }

  async function onSheet(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      const lines = rowsToLines(rows);
      if (!lines.length) { toast("No emails found in that file.", "error"); return; }
      setRecipientsText((prev) => (prev.trim() ? prev.trim() + "\n" : "") + lines.join("\n"));
      toast(`Loaded ${lines.length} recipient(s) from ${f.name}`, "success");
    } catch {
      toast("Couldn't read that spreadsheet.", "error");
    } finally {
      e.target.value = ""; // allow re-uploading the same file
    }
  }

  async function generate() {
    if (!pdfB64) return toast("Upload your resume PDF first.", "error");
    if (jd.trim().length < 40) return toast("Paste the job description.", "error");
    setBusy(true);
    setResults(null);
    try {
      const res = await fetch("/api/referral/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfBase64: pdfB64, jd, company, jobLink }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to draft the email.");
      setSubject(data.subject);
      setEmailBody(data.body);
      toast("Draft ready — review and edit before sending", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!subject.trim() || emailBody.trim().length < 20) return toast("Generate the draft first.", "error");
    if (!recipients.length) return toast("Add at least one recipient (Name, email).", "error");
    if (!gmailUser.trim() || gmailPass.replace(/\s+/g, "").length < 12) return toast("Enter your Gmail and 16-char App Password.", "error");
    if (!window.confirm(`Send this email to ${recipients.length} ${recipients.length === 1 ? "person" : "people"} from ${gmailUser}?`)) return;
    setSending(true);
    setResults(null);
    try {
      const res = await fetch("/api/referral/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gmailUser, gmailPass, subject, body: emailBody, recipients, pdfBase64: pdfB64, filename: fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send.");
      setResults(data.results);
      toast(`Sent ${data.sent}/${data.results.length}${data.failed ? ` — ${data.failed} failed` : ""}`, data.failed ? "error" : "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="resume-page">
      <header className="channels-head">
        <button className="btn btn-icon btn-ghost" onClick={() => router.push("/")} title="Back to dashboard">
          <IconArrowLeft />
        </button>
        <div>
          <h1>Referral to Recruiters</h1>
          <p>Resume + job description → a professional referral-request email. Add recruiters, review, and send from your Gmail (resume attached).</p>
        </div>
      </header>

      <details className="how-box" open>
        <summary>What this is &amp; how to use it</summary>
        <p className="how-lead">
          A referral from someone inside a company gives your application a real boost. This tool writes a polished,
          personalized email asking recruiters or employees at your target company to refer you for a specific job —
          with your resume attached. Each person gets their own copy, addressed to them by name.
        </p>
        <ol>
          <li><strong>Add the job.</strong> Upload your resume (PDF) and paste the job description. Optionally add the company name and the job posting link.</li>
          <li><strong>Generate the draft.</strong> Click <em>Generate draft</em> — a professional referral-request email is written from your resume and the role.</li>
          <li><strong>Review &amp; edit.</strong> Tweak the subject and body freely. <code>{"{{name}}"}</code> becomes each recipient&apos;s first name and <code>{"{{my_email}}"}</code> becomes your Gmail when sent.</li>
          <li><strong>Add recruiters.</strong> Paste <em>Name, email</em> lines, or upload an Excel/CSV with name &amp; email columns — they&apos;re added to the list.</li>
          <li><strong>Connect your Gmail.</strong> Enter your Gmail address and a 16-character <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Password</a> (needs 2-Step Verification). It&apos;s used only for this send — never stored.</li>
          <li><strong>Send.</strong> Click <em>Send to N people</em> — everyone gets a personalized email with your resume attached, and you see who it reached.</li>
        </ol>
      </details>

      <div className={`resume-layout${subject ? " compose" : ""}`}>
        {/* Left: compose inputs + editable draft */}
        <div className="resume-controls">
          <div className="resume-box">
            <section className="fr-section" style={{ marginTop: 0 }}>
              <div className="field">
                <label htmlFor="pdf">Your resume (PDF)</label>
                <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={onFile} />
                {fileName && <span className="cell-sub">Loaded: {fileName}</span>}
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="company">Company (optional)</label>
                <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Stripe" />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="joblink">Job link (optional)</label>
                <input id="joblink" type="url" value={jobLink} onChange={(e) => setJobLink(e.target.value)} placeholder="https://…/jobs/12345" />
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="jd">Job description</label>
                <textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)} rows={6} placeholder="Paste the job description…" />
              </div>
              <button className="btn btn-primary" onClick={generate} disabled={busy} style={{ marginTop: 14, justifyContent: "center" }}>
                {busy ? "Drafting…" : subject ? "Regenerate draft" : "Generate draft"}
              </button>
              {busy && <Spinner label="Writing your referral email…" />}
            </section>

            {subject && (
              <section className="fr-section">
                <h2 className="fr-heading">Draft (edit freely)</h2>
                <div className="field">
                  <label htmlFor="subject">Subject</label>
                  <input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="ebody">Body</label>
                  <textarea id="ebody" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={14} />
                  <span className="cell-sub"><code>{"{{name}}"}</code> → each recipient&apos;s first name; <code>{"{{my_email}}"}</code> → your Gmail address (filled on send).</span>
                </div>
              </section>
            )}
          </div>
          <div className="hint" style={{ marginTop: 16 }}>
            Signed in as <strong style={{ color: "var(--ink-2)", marginLeft: 4 }}>{username}</strong>
          </div>
        </div>

        {/* Right: recipients + send from Gmail */}
        {subject && (
          <div className="resume-send-col">
            <div className="resume-box">
              <section className="fr-section" style={{ marginTop: 0 }}>
                <h2 className="fr-heading">Recipients ({recipients.length})</h2>
                <div className="field">
                  <label htmlFor="recips">One per line — <em>Name, email@company.com</em> — or upload a spreadsheet</label>
                  <textarea id="recips" value={recipientsText} onChange={(e) => setRecipientsText(e.target.value)} rows={5}
                    placeholder={"Priya Sharma, priya@acme.com\nJohn Doe <john.doe@acme.com>"} />
                  <div style={{ marginTop: 8 }}>
                    <input id="sheet" type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={onSheet} />
                    <span className="cell-sub">Excel/CSV with name &amp; email columns — appended to the list above.</span>
                  </div>
                </div>
                {recipients.length > 0 && (
                  <div className="kw-row">
                    {recipients.slice(0, 30).map((r) => (
                      <span key={r.email} className="kw kw-have">{r.name || "?"} · {r.email}</span>
                    ))}
                  </div>
                )}
              </section>

              <section className="fr-section">
                <h2 className="fr-heading">Send from your Gmail</h2>
                <p className="cell-sub" style={{ marginTop: 0 }}>
                  Needs a Gmail <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">App Password</a> (2-Step Verification must be on). Used only for this send — never stored.
                </p>
                <div className="field" style={{ marginTop: 8 }}>
                  <label htmlFor="guser">Gmail address</label>
                  <input id="guser" type="email" autoComplete="off" value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} placeholder="you@gmail.com" />
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="gpass">Gmail App Password</label>
                  <input id="gpass" type="password" autoComplete="new-password" value={gmailPass} onChange={(e) => setGmailPass(e.target.value)} placeholder="16-character app password" />
                </div>
                <button className="btn btn-primary" onClick={send} disabled={sending || !recipients.length} style={{ marginTop: 14, justifyContent: "center" }}>
                  {sending ? "Sending…" : `Send to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}`}
                </button>
                {sending && <Spinner label="Sending emails…" />}
              </section>

              {results && (
                <section className="fr-section">
                  <h2 className="fr-heading">Results</h2>
                  <div className="kw-changes">
                    {results.map((r) => (
                      <div key={r.email} className="kw-change">
                        <span className={`kw ${r.ok ? "kw-have" : "kw-missing"}`}>{r.ok ? "✓ sent" : "✗ failed"}</span>
                        <span className="cell-sub">{r.email}{r.error ? ` — ${r.error}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
