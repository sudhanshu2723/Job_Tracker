// Adzuna — official job API (free key). https://developer.adzuna.com
// Set ADZUNA_APP_ID, ADZUNA_APP_KEY, ADZUNA_COUNTRY (default "in") in .env.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { fetchJson, errResult, SEARCH_TERMS } from "./common";

const COUNTRY = process.env.ADZUNA_COUNTRY || "in"; // in = India

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanAdzuna(): Promise<ScanResult> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return errResult("adzuna", new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set"));

  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();

  for (const term of SEARCH_TERMS) {
    try {
      const url =
        `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1` +
        `?app_id=${id}&app_key=${key}&results_per_page=50` +
        `&what=${encodeURIComponent(term)}&content-type=application/json`;
      const data = await fetchJson(url);
      for (const r of data?.results ?? []) {
        const link = r.redirect_url ?? "";
        const role = r.title ?? "";
        if (!link || !role || seen.has(link)) continue;
        if (!matchesRole(role)) continue;
        seen.add(link);
        jobs.push({
          company: r.company?.display_name ?? "",
          role,
          link,
          location: r.location?.display_name ?? "",
        });
      }
    } catch (err) {
      errors.push({
        company: `adzuna:${term}`,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { jobs, scannedCompanies: SEARCH_TERMS.length, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
