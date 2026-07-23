// Jooble — job aggregator API (free key). https://jooble.org/api/about
// Set JOOBLE_KEY in .env. JOOBLE_LOCATION is a comma-separated list of places
// (default: a worldwide spread). One request per location — mind the 500/day cap.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { errResult } from "./common";

const LOCATIONS = (
  process.env.JOOBLE_LOCATION || "United States,United Kingdom,India,Canada,Germany"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const QUERY = process.env.JOOBLE_QUERY || "software developer engineer";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanJooble(): Promise<ScanResult> {
  const key = process.env.JOOBLE_KEY;
  if (!key) return errResult("jooble", new Error("JOOBLE_KEY not set"));

  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();

  for (const location of LOCATIONS) {
    try {
      const res = await fetch(`https://jooble.org/api/${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keywords: QUERY, location }),
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
      errors.push({
        company: `jooble:${location}`,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { jobs, scannedCompanies: LOCATIONS.length, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
