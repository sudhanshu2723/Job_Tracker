// Jooble — job aggregator API (free key). https://jooble.org/api/about
// Set JOOBLE_KEY (and optional JOOBLE_LOCATION, default "India") in .env.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { errResult } from "./common";

const LOCATION = process.env.JOOBLE_LOCATION || "India";
// One broad query per scan to conserve Jooble's 500-request cap.
const QUERY = process.env.JOOBLE_QUERY || "software developer engineer";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanJooble(): Promise<ScanResult> {
  const key = process.env.JOOBLE_KEY;
  if (!key) return errResult("jooble", new Error("JOOBLE_KEY not set"));

  const jobs: ScannedJob[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch(`https://jooble.org/api/${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keywords: QUERY, location: LOCATION }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();
    for (const j of data?.jobs ?? []) {
      const link = j.link ?? "";
      const role = j.title ?? "";
      if (!link || !role || seen.has(link)) continue;
      if (!matchesRole(role)) continue;
      seen.add(link);
      jobs.push({ company: j.company ?? "", role, link, location: j.location ?? "" });
    }
  } catch (err) {
    return errResult("jooble", err);
  }
  return { jobs, scannedCompanies: 1, errors: [] };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
