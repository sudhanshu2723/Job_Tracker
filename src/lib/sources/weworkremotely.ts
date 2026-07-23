// We Work Remotely — public RSS feed (no key). Programming category.
// https://weworkremotely.com/categories/remote-programming-jobs.rss
import type { ScanResult, ScannedJob } from "../scanner";
import { collect, errResult } from "./common";

const FEED = "https://weworkremotely.com/categories/remote-programming-jobs.rss";

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

export async function scanWeWorkRemotely(): Promise<ScanResult> {
  try {
    const res = await fetch(FEED, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "Mozilla/5.0 (JobTracker)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const rows: ScannedJob[] = (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).map((item) => {
      const tag = (t: string) => {
        const m = item.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`));
        return m ? decode(m[1]) : "";
      };
      const rawTitle = tag("title"); // "Company: Role"
      const i = rawTitle.indexOf(":");
      return {
        company: i > 0 ? rawTitle.slice(0, i).trim() : "",
        role: i > 0 ? rawTitle.slice(i + 1).trim() : rawTitle,
        link: tag("link"),
        location: tag("region") || "Remote",
      };
    });

    return collect(rows, (r) => r);
  } catch (err) {
    return errResult("weworkremotely", err);
  }
}
