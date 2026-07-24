// In-place PDF résumé editing for any text résumé (font auto-detected).
// Three operations, all width-checked so the page never overflows:
//   • append  — draw a keyword in the empty space at a line's end (line has room).
//   • line    — swap: TRULY remove a full skills line's text, redraw it (existing
//               skills minus a dropped one + new keywords), keeping its bold label.
//   • bullet  — rewrite a whole project bullet: remove ALL its wrapped lines, then
//               re-wrap the new (same-length) text across the same lines.
// Old text is removed from the content stream (not just covered), so an ATS reads
// one clean résumé. Untouched content stays byte-identical.

import { readFileSync } from "fs";
import { join } from "path";

export type PdfOp =
  | { kind: "append"; find: string; text: string }
  | { kind: "line"; find: string; text: string; boldPrefix?: string }
  | { kind: "bullet"; find: string; text: string };

export interface EditResult {
  pdf: Uint8Array;
  applied: boolean[];
}

export interface ResumeParts {
  text: string; // full résumé text (for dedup / validation)
  lines: { find: string; room: number; label: string; section: string }[]; // every line
  bullets: { find: string; text: string; chars: number; section: string }[]; // every grouped bullet
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const clean = (s: string) =>
  s.replace(/[‣▪·▸►◦]/g, "•").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, " ").trim();
// Strip a leading bullet glyph (any short non-word marker) from a line.
const stripBullet = (s: string) => s.replace(/^[^\p{L}\p{N}(]+/u, "").trim();
// A line is a bullet if its first glyph is a short non-word marker followed by
// real text — works for any bullet char/font (the text may sit in item[2] after
// a spacing item, so we look past whitespace).
const looksBullet = (items: { str: string; x: number; w: number }[]) => {
  if (items.length < 2) return false;
  const g = items[0].str.trim();
  if (!g || g.length > 2 || /[\p{L}\p{N}(]/u.test(g)) return false;
  return items.slice(1).some((it) => it.str.trim().length > 0);
};
// x where a bullet's text begins (first non-blank item after the marker).
const bulletTextItem = (items: { str: string; x: number; size: number }[]) =>
  items.slice(1).find((it) => it.str.trim().length > 0) ?? items[1];

/* eslint-disable @typescript-eslint/no-explicit-any */

let fontCache: { roman: Buffer; bold: Buffer } | null = null;
function charterBytes() {
  if (!fontCache) {
    const dir = join(process.cwd(), "src", "lib", "fonts");
    fontCache = { roman: readFileSync(join(dir, "XCharter-Roman.otf")), bold: readFileSync(join(dir, "XCharter-Bold.otf")) };
  }
  return fontCache;
}
const measure = (f: any, t: string, size: number) => {
  try { return f.widthOfTextAtSize(t, size); } catch { return f.widthOfTextAtSize(t.replace(/[^\x20-\x7E]/g, ""), size); }
};
const draw = (page: any, f: any, t: string, x: number, y: number, size: number, color: any) => {
  try { page.drawText(t, { x, y, size, font: f, color }); } catch { page.drawText(t.replace(/[^\x20-\x7E]/g, ""), { x, y, size, font: f, color }); }
};
function wrapText(text: string, f: any, size: number, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (measure(f, t, size) <= maxW || !cur) cur = t;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

// ── content-stream text removal (see git history for the standalone proof) ──────
type Span = { t: string; v?: string | number; start: number; end: number };
function tokenize(s: string): Span[] {
  const toks: Span[] = [];
  let i = 0;
  const n = s.length;
  const isWS = (c: string) => " \n\r\t\f\0".includes(c);
  while (i < n) {
    const c = s[i];
    const start = i;
    if (isWS(c)) { i++; continue; }
    if (c === "%") { while (i < n && s[i] !== "\n" && s[i] !== "\r") i++; continue; }
    if (c === "(") { let d = 1, j = i + 1; while (j < n && d > 0) { if (s[j] === "\\") { j += 2; continue; } if (s[j] === "(") d++; else if (s[j] === ")") d--; j++; } toks.push({ t: "str", start, end: j }); i = j; continue; }
    if (c === "<" && s[i + 1] !== "<") { let j = i + 1; while (j < n && s[j] !== ">") j++; toks.push({ t: "str", start, end: j + 1 }); i = j + 1; continue; }
    if (c === "<" && s[i + 1] === "<") { toks.push({ t: "op", v: "<<", start, end: i + 2 }); i += 2; continue; }
    if (c === ">" && s[i + 1] === ">") { toks.push({ t: "op", v: ">>", start, end: i + 2 }); i += 2; continue; }
    if (c === "[") { toks.push({ t: "op", v: "[", start, end: i + 1 }); i++; continue; }
    if (c === "]") { toks.push({ t: "op", v: "]", start, end: i + 1 }); i++; continue; }
    if (c === "/") { let j = i + 1; while (j < n && !isWS(s[j]) && !"()<>[]{}/%".includes(s[j])) j++; toks.push({ t: "name", start, end: j }); i = j; continue; }
    let j = i;
    while (j < n && !isWS(s[j]) && !"()<>[]{}/%".includes(s[j])) j++;
    const w = s.slice(i, j);
    if (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(w)) toks.push({ t: "num", v: parseFloat(w), start, end: j });
    else toks.push({ t: "op", v: w, start, end: j });
    i = j;
  }
  return toks;
}
type M = [number, number, number, number, number, number];
const mul = (m: M, o: M): M => [m[0]*o[0]+m[1]*o[2], m[0]*o[1]+m[1]*o[3], m[2]*o[0]+m[3]*o[2], m[2]*o[1]+m[3]*o[3], m[4]*o[0]+m[5]*o[2]+o[4], m[4]*o[1]+m[5]*o[3]+o[5]];

function removeRegions(src: string, targets: { y: number; xMin: number; xMax: number }[]): { out: string; count: number } {
  if (/\bBI\b/.test(src)) return { out: src, count: 0 };
  const toks = tokenize(src);
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  let tm: M = [1, 0, 0, 1, 0, 0], tlm: M = [1, 0, 0, 1, 0, 0], leading = 0;
  let args: Span[] = [];
  const cuts: [number, number, string][] = [];
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t !== "op") { args.push(tk); continue; }
    if (tk.v === "[") { const s0 = tk.start; while (k < toks.length && !(toks[k].t === "op" && toks[k].v === "]")) k++; args.push({ t: "arr", start: s0, end: toks[k]?.end ?? s0 }); continue; }
    const op = tk.v as string;
    const nums = args.filter((a) => a.t === "num").map((a) => a.v as number);
    switch (op) {
      case "q": stack.push(ctm.slice() as M); break;
      case "Q": if (stack.length) ctm = stack.pop()!; break;
      case "cm": ctm = mul([nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]], ctm); break;
      case "BT": tm = [1, 0, 0, 1, 0, 0]; tlm = [1, 0, 0, 1, 0, 0]; break;
      case "Tm": tlm = [nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]]; tm = tlm.slice() as M; break;
      case "Td": tlm = mul([1, 0, 0, 1, nums[0], nums[1]], tlm); tm = tlm.slice() as M; break;
      case "TD": leading = -nums[1]; tlm = mul([1, 0, 0, 1, nums[0], nums[1]], tlm); tm = tlm.slice() as M; break;
      case "TL": leading = nums[0]; break;
      case "T*": tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice() as M; break;
      case "Tj": case "TJ": case "'": case "\"": {
        if (op === "'" || op === "\"") { tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm.slice() as M; }
        const dev = mul(tm, ctm);
        const x = dev[4], y = dev[5];
        if (targets.some((t) => Math.abs(y - t.y) < 3 && x >= t.xMin - 2 && x <= t.xMax + 2)) {
          const from = args.length ? args[0].start : tk.start;
          let repl = "";
          if (op === "'") repl = " T* ";
          if (op === "\"") repl = ` ${nums[0]} Tw ${nums[1]} Tc T* `;
          cuts.push([from, tk.end, repl]);
        }
        break;
      }
    }
    args = [];
  }
  cuts.sort((a, b) => b[0] - a[0]);
  let out = src;
  for (const [a, b, repl] of cuts) out = out.slice(0, a) + repl + out.slice(b);
  return { out, count: cuts.length };
}

async function clearRegions(pdf: any, pageNode: any, targets: { y: number; xMin: number; xMax: number }[]): Promise<boolean> {
  const { PDFRawStream, PDFArray, PDFName, decodePDFRawStream } = await import("pdf-lib");
  const contents = pdf.context.lookup(pageNode.get(PDFName.of("Contents")));
  let src = "";
  if (contents instanceof PDFRawStream) src = Buffer.from(decodePDFRawStream(contents).decode()).toString("latin1");
  else if (contents instanceof PDFArray) {
    for (const ref of contents.asArray()) {
      const s = pdf.context.lookup(ref);
      if (s instanceof PDFRawStream) src += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") + "\n";
    }
  } else return false;
  const { out, count } = removeRegions(src, targets);
  if (!count) return false;
  pageNode.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(out)));
  return true;
}

// ── résumé structure parsing ────────────────────────────────────────────────
// Section header detection — case-insensitive (Title Case or ALL CAPS), used
// ONLY to PROTECT sensitive sections; the AI still finds skills/projects itself.
const SECTION_RE =
  /^(EDUCATION|TECHNICAL SKILLS|SKILLS|CORE COMPETENC\w+|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EXPERIENCE|INTERNSHIPS?|EMPLOYMENT|PROJECTS|PERSONAL PROJECTS|ACADEMIC PROJECTS|ACHIEVEMENTS|AWARDS|HONOU?RS?|SUMMARY|OBJECTIVE|CERTIFICATIONS?|POSITIONS OF RESPONSIBILITY|RESPONSIBILITIES|EXTRACURRICULAR|VOLUNTEER\w*|LEADERSHIP|PUBLICATIONS?)\b/i;
function sectionOf(line: string, current: string): string {
  const t = line.trim();
  if (t.length <= 30 && t.split(/\s+/).length <= 3 && !/[,:0-9]/.test(t) && SECTION_RE.test(t)) return SECTION_RE.exec(t)![1].toLowerCase();
  return current;
}
/** True for sections whose content must never be edited. */
export const isProtectedSection = (s: string) => /educat|experience|internship|employ|achiev|award|honou?r|certificat|position|responsibilit|extracurric|volunteer|leadership|publication/i.test(s);

// The label of a "Category  values" line — detected structurally (a colon, or a
// tab/wide-gap before the values), NOT by any keyword. Works for "Languages:",
// "Core Competencies", "Tech Stack", etc. "" when the line isn't label+values.
function detectLabel(items: { str: string; x: number; w: number }[]): string {
  const text = items.map((i) => i.str).join("");
  const ci = text.indexOf(": ");
  if (ci > 0 && ci <= 30) return text.slice(0, ci).trim();
  for (let k = 0; k < items.length - 1; k++) {
    if (!items[k].str.trim()) continue;
    const nxt = items[k + 1];
    const wideSpace = !nxt.str.trim() && nxt.w >= 8;
    const gap = nxt.x - (items[k].x + items[k].w);
    if (wideSpace || gap >= 8) {
      const lab = items.slice(0, k + 1).map((i) => i.str).join("").trim();
      return lab && lab.length <= 30 ? lab : "";
    }
  }
  return "";
}

type Item = { str: string; x: number; y: number; w: number; size: number };
type Line = { text: string; items: Item[]; section: string };
type Bullet = { lineIdxs: number[]; xBullet: number; xText: number; size: number; ys: number[]; text: string; find: string; section: string };
type PageData = { items: Item[]; lines: Line[]; pageW: number; pageRight: number; bullets: Bullet[] };

async function parse(pdfBytes: Uint8Array): Promise<PageData[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: pdfBytes.slice(), useSystemFonts: true, isEvalSupported: false }).promise;
  const out: PageData[] = [];
  let section = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const pageW = page.getViewport({ scale: 1 }).width;
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const it of tc.items as any[]) {
      if (typeof it.str !== "string" || it.str === "") continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 10 });
    }
    const lines: Line[] = [];
    let cur: Item[] = [];
    let cy: number | null = null;
    const flush = () => { if (cur.length) { const text = cur.map((i) => i.str).join(""); section = sectionOf(text, section); lines.push({ text, items: cur.slice(), section }); } };
    for (const it of items) {
      if (cy === null || Math.abs(it.y - cy) > 3) { flush(); cur = []; cy = it.y; }
      cur.push(it);
    }
    flush();
    const pageRight = Math.min(pageW - 18, Math.max(...items.map((i) => i.x + i.w)));

    // Group bullets anywhere by indent; the AI decides which are project ones.
    const bullets: Bullet[] = [];
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!looksBullet(L.items)) continue;
      const textItem = bulletTextItem(L.items);
      const xText = textItem.x;
      const idxs = [i];
      let j = i + 1;
      while (j < lines.length) {
        const Lj = lines[j];
        if (!Lj.items.length) break;
        if (looksBullet(Lj.items)) break;
        if (Math.abs(Lj.items[0].x - xText) > 4) break; // back to margin = title/new block
        idxs.push(j); j++;
      }
      const grp = idxs.map((k) => lines[k]);
      bullets.push({
        lineIdxs: idxs,
        xBullet: L.items[0].x,
        xText,
        size: textItem.size,
        ys: grp.map((g) => g.items[g.items.length - 1].y),
        text: stripBullet(grp.map((g) => g.text).join(" ")).replace(/\s+/g, " ").trim(),
        find: stripBullet(L.text).replace(/\s+/g, " ").trim(),
        section: L.section,
      });
      i = j - 1;
    }
    out.push({ items, lines, pageW, pageRight, bullets });
  }
  return out;
}

const rightBoundOf = (pd: PageData, insX: number, y: number, size: number) => {
  let rb = pd.pageRight;
  for (const it of pd.items) if (Math.abs(it.y - y) < size * 0.55 && it.x > insX + 0.5) rb = Math.min(rb, it.x);
  return rb;
};
const spareChars = (pd: PageData, line: Line) => {
  const last = line.items[line.items.length - 1];
  const rb = rightBoundOf(pd, last.x + last.w, last.y, last.size);
  return Math.max(0, Math.floor((rb - (last.x + last.w) - 3) / (last.size * 0.48)));
};

/** Whole-résumé view for the AI: every line (with room + label) and every bullet.
 *  No section/keyword assumptions — the AI decides what's a skill line / project. */
export async function analyzeResume(pdfBytes: Uint8Array): Promise<ResumeParts> {
  const pages = await parse(pdfBytes);
  const lines: ResumeParts["lines"] = [];
  const bullets: ResumeParts["bullets"] = [];
  for (const pd of pages) {
    const inBullet = new Set(pd.bullets.flatMap((b) => b.lineIdxs));
    pd.lines.forEach((L, i) => {
      if (!L.text.trim() || inBullet.has(i)) return; // bullet lines are offered as bullets
      lines.push({ find: L.text, room: spareChars(pd, L), label: detectLabel(L.items), section: L.section });
    });
    for (const b of pd.bullets) bullets.push({ find: b.find, text: b.text, chars: b.text.length, section: b.section });
  }
  const text = pages.flatMap((pd) => pd.lines.map((L) => L.text)).join("\n");
  return { text, lines, bullets };
}

export async function applyEdits(pdfBytes: Uint8Array, ops: PdfOp[]): Promise<EditResult> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const pages = await parse(pdfBytes);
  const pdf = await PDFDocument.load(pdfBytes);
  const { roman, bold } = await embedMatchingFont(pdf);
  const ink = rgb(0.1, 0.1, 0.1);
  const pdfPages = pdf.getPages();
  const applied = new Array(ops.length).fill(false);
  const GAP = 3;

  const findLine = (find: string): { pi: number; li: number } | null => {
    const key = norm(find).slice(0, 48);
    if (!key) return null;
    for (let pi = 0; pi < pages.length; pi++) {
      const li = pages[pi].lines.findIndex((L) => norm(L.text).includes(key) || norm(stripBullet(L.text)).includes(key));
      if (li !== -1) return { pi, li };
    }
    return null;
  };
  const findBullet = (find: string): { pi: number; b: Bullet } | null => {
    const key = norm(find).slice(0, 48);
    if (!key) return null;
    for (let pi = 0; pi < pages.length; pi++) {
      const b = pages[pi].bullets.find((bl) => norm(bl.find).includes(key) || key.includes(norm(bl.find).slice(0, 48)));
      if (b) return { pi, b };
    }
    return null;
  };

  // Plan removals + draws first; only remove old text we can actually redraw.
  type Draw = { oi: number; pi: number; run: () => void };
  const draws: Draw[] = [];
  const regionsByPage = new Map<number, { y: number; xMin: number; xMax: number }[]>();
  const addRegion = (pi: number, line: Line) => {
    const r = { y: line.items[line.items.length - 1].y, xMin: Math.min(...line.items.map((i) => i.x)), xMax: Math.max(...line.items.map((i) => i.x + i.w)) };
    if (!regionsByPage.has(pi)) regionsByPage.set(pi, []);
    regionsByPage.get(pi)!.push(r);
  };
  const endX = new Map<string, number>();

  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi];
    if (op.kind === "bullet") {
      const hit = findBullet(op.find);
      if (!hit) continue;
      const { pi, b } = hit;
      const pd = pages[pi];
      const maxW = pd.pageRight - b.xText;
      let body = clean(stripBullet(op.text));
      let wrapped = wrapText(body, roman, b.size, maxW);
      while (wrapped.length > b.ys.length && body.includes(" ")) { body = body.slice(0, body.lastIndexOf(" ")).replace(/[\s,;]+$/, ""); wrapped = wrapText(body, roman, b.size, maxW); }
      if (!wrapped.length) continue;
      b.lineIdxs.forEach((li) => addRegion(pi, pd.lines[li]));
      draws.push({ oi, pi, run: () => {
        draw(pdfPages[pi], roman, "•", b.xBullet, b.ys[0], b.size, ink);
        wrapped.forEach((ln, k) => draw(pdfPages[pi], roman, ln, b.xText, b.ys[k], b.size, ink));
      } });
    } else if (op.kind === "line") {
      const hit = findLine(op.find);
      if (!hit) continue;
      const { pi, li } = hit;
      const pd = pages[pi];
      const line = pd.lines[li];
      const first = line.items[0];
      const last = line.items[line.items.length - 1];
      const y = last.y, size = last.size;
      const avail = rightBoundOf(pd, last.x + last.w, y, size) - first.x - GAP;
      const full = clean(op.text);
      let prefix = "", rest = full;
      if (op.boldPrefix) { const bp = clean(op.boldPrefix); if (bp && full.startsWith(bp)) { prefix = bp; rest = full.slice(bp.length); } }
      while (measure(bold, prefix, size) + measure(roman, rest, size) > avail && rest.lastIndexOf(",") > 0) rest = rest.slice(0, rest.lastIndexOf(",")).replace(/\s+$/, "");
      if (!rest.trim() || measure(bold, prefix, size) + measure(roman, rest, size) > avail) continue;
      addRegion(pi, line);
      draws.push({ oi, pi, run: () => {
        let x = first.x;
        if (prefix) { draw(pdfPages[pi], bold, prefix, x, y, size, ink); x += measure(bold, prefix, size); }
        draw(pdfPages[pi], roman, rest, x, y, size, ink);
      } });
    } else {
      // append — draw at line end, chaining per line (no removal).
      const hit = findLine(op.find);
      if (!hit) continue;
      const { pi, li } = hit;
      const pd = pages[pi];
      const line = pd.lines[li];
      const last = line.items[line.items.length - 1];
      const y = last.y, size = last.size;
      const lk = `${pi}:${li}`;
      const curX = endX.get(lk) ?? last.x + last.w;
      const text = clean(op.text).startsWith(",") ? clean(op.text) : ", " + clean(op.text);
      const w = measure(roman, text, size);
      if (w <= rightBoundOf(pd, last.x + last.w, y, size) - curX - GAP) {
        endX.set(lk, curX + w);
        draws.push({ oi, pi, run: () => draw(pdfPages[pi], roman, text, curX, y, size, ink) });
      }
    }
  }

  // Remove all planned old text, then draw (only on pages whose removal succeeded).
  const clearedPage = new Set<number>();
  for (const [pi, regions] of regionsByPage) if (await clearRegions(pdf, pdfPages[pi].node, regions)) clearedPage.add(pi);
  for (const d of draws) {
    const op = ops[d.oi];
    if ((op.kind === "bullet" || op.kind === "line") && !clearedPage.has(d.pi)) continue;
    d.run();
    applied[d.oi] = true;
  }

  return { pdf: await pdf.save(), applied };
}

async function embedMatchingFont(pdf: any) {
  const { PDFName, StandardFonts } = await import("pdf-lib");
  let names = "";
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    const bf = (obj as any)?.get?.(PDFName.of("BaseFont"));
    if (bf) names += " " + bf.toString().toLowerCase();
  }
  const sans = /helvetica|arial|calibri|lato|roboto|nunito|open ?sans|opensans|verdana|segoe|tahoma|fira|source ?sans|montserrat|dejavu ?sans/.test(names);
  const serif = /charter|times|termes|minion|garamond|georgia|nimbus ?rom|cmr|cmbx|cmu|computer ?modern|latin ?modern|lmroman|palatino|libertine|utopia|xcharter|roman/.test(names);
  if (/charter/.test(names)) {
    const fontkit = (await import("@pdf-lib/fontkit")).default;
    pdf.registerFontkit(fontkit);
    const cb = charterBytes();
    return { roman: await pdf.embedFont(cb.roman, { subset: false }), bold: await pdf.embedFont(cb.bold, { subset: false }) };
  }
  if (sans && !serif) return { roman: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) };
  return { roman: await pdf.embedFont(StandardFonts.TimesRoman), bold: await pdf.embedFont(StandardFonts.TimesRomanBold) };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
