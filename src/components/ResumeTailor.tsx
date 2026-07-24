"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./Toast";
import { Spinner } from "./Spinner";
import { IconArrowLeft } from "./icons";

interface Edit {
  section: string;
  keyword: string;
  detail: string;
  applied: boolean;
}
interface Result {
  editedPdfBase64: string;
  edits: Edit[];
  keywords: string[];
  missing: string[];
}

async function fileToBase64(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBlobUrl(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export default function ResumeTailor({ username }: { username: string }) {
  const router = useRouter();
  const toast = useToast();
  const [fileName, setFileName] = useState("");
  const [pdfB64, setPdfB64] = useState("");
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Blob URL for the edited PDF preview/download; revoked when it changes/unmounts.
  const blobUrl = useMemo(() => (result?.editedPdfBase64 ? base64ToBlobUrl(result.editedPdfBase64) : ""), [result]);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return toast("Please upload a PDF résumé.", "error");
    setFileName(f.name);
    setPdfB64(await fileToBase64(f));
    setResult(null);
  }

  async function tailor() {
    if (!pdfB64) return toast("Upload your résumé PDF first.", "error");
    if (jd.trim().length < 40) return toast("Paste the full job description.", "error");
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pdfBase64: pdfB64, jd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to tailor résumé.");
      setResult(data);
      const applied = data.edits.filter((e: Edit) => e.applied).length;
      toast(applied ? `Added ${applied} keyword change(s) to your PDF` : "No changes fit — see notes", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "error");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = (fileName.replace(/\.pdf$/i, "") || "resume") + "-tailored.pdf";
    a.click();
  }

  const appliedEdits = result?.edits.filter((e) => e.applied) ?? [];
  const skippedEdits = result?.edits.filter((e) => !e.applied) ?? [];

  return (
    <div className="resume-page">
      <header className="channels-head">
        <button className="btn btn-icon btn-ghost" onClick={() => router.push("/")} title="Back to dashboard">
          <IconArrowLeft />
        </button>
        <div>
          <h1>Résumé keyword tailor</h1>
          <p>Upload your résumé PDF + a job description → missing keywords are filled into your Skills lines and woven into your project descriptions, in place. Work experience and everything else stays identical.</p>
        </div>
      </header>

      <details className="how-box" open>
        <summary>What this is &amp; how to use it</summary>
        <p className="how-lead">
          Automatically matches your résumé to a specific job. It reads the job description, then edits your PDF <strong>in place</strong> —
          adding the missing keywords into your skills lines and weaving them into your project bullets — so it passes keyword screening (ATS)
          while your layout, fonts, and work experience stay exactly the same.
        </p>
        <ol>
          <li><strong>Upload &amp; paste.</strong> Add your résumé (PDF) and paste the full job description.</li>
          <li><strong>Tailor.</strong> Click <em>Tailor résumé</em> — the AI fills missing keywords into your skills and rewrites project descriptions to include them.</li>
          <li><strong>Review.</strong> See the keyword coverage and exactly what was added or reworded — nothing outside skills and projects is touched.</li>
          <li><strong>Preview.</strong> Check the edited résumé on the right; the layout and everything else is unchanged.</li>
          <li><strong>Download.</strong> Grab the tailored PDF and submit it for that role.</li>
        </ol>
      </details>

      <div className={`resume-layout${result ? " has-preview" : ""}`}>
        {/* Left: controls, keyword coverage, applied changes */}
        <div className="resume-controls">
          <div className="resume-box">
            <section className="fr-section" style={{ marginTop: 0 }}>
              <div className="field">
                <label htmlFor="pdf">Your résumé (PDF)</label>
                <input id="pdf" type="file" accept="application/pdf,.pdf" onChange={onFile} />
                {fileName && <span className="cell-sub">Loaded: {fileName}</span>}
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="jd">Job description (paste it)</label>
                <textarea id="jd" value={jd} onChange={(e) => setJd(e.target.value)} rows={7} placeholder="Paste the full job description here…" />
              </div>
              <button className="btn btn-primary" onClick={tailor} disabled={busy} style={{ marginTop: 14, justifyContent: "center" }}>
                {busy ? "Updating your PDF…" : "Tailor résumé"}
              </button>
              {busy && <Spinner label="Reading your PDF, adding keywords in place…" />}
            </section>

            {result && (
              <>
                <section className="fr-section">
                  <h2 className="fr-heading">Keyword coverage</h2>
                  <div className="kw-row">
                    {result.keywords.map((k) => (
                      <span key={k} className={`kw ${result.missing.includes(k) ? "kw-missing" : "kw-have"}`}>{k}</span>
                    ))}
                  </div>
                </section>

                <section className="fr-section">
                  <h2 className="fr-heading">Added to your résumé ({appliedEdits.length})</h2>
                  {appliedEdits.length === 0 ? (
                    <div className="empty-mini">Nothing new fit — your Skills/Projects already cover it.</div>
                  ) : (
                    <div className="kw-changes">
                      {appliedEdits.map((e, i) => (
                        <div key={i} className="kw-change">
                          <span className="kw kw-have">{e.keyword ? `+ ${e.keyword}` : `✎ ${e.section}`}</span>
                          <span className="cell-sub">{e.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {skippedEdits.length > 0 && (
                    <p className="cell-sub" style={{ marginTop: 10 }}>
                      Couldn&apos;t fit: {skippedEdits.map((e) => e.keyword || e.section).join(", ")}.
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
          <div className="hint" style={{ marginTop: 16 }}>
            Signed in as <strong style={{ color: "var(--ink-2)", marginLeft: 4 }}>{username}</strong>
          </div>
        </div>

        {/* Right: the edited PDF, previewed + downloadable */}
        {result && (
          <div className="resume-preview-col">
            <div className="preview-bar">
              <span className="fr-heading" style={{ margin: 0 }}>Preview (edited in place)</span>
              <button className="btn btn-primary" onClick={download}>Download PDF</button>
            </div>
            {blobUrl && <iframe title="Edited résumé" src={`${blobUrl}#view=FitH`} className="pdf-preview" />}
          </div>
        )}
      </div>
    </div>
  );
}
