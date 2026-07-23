// Adzuna — official job API (free key). https://developer.adzuna.com
// Set ADZUNA_APP_ID, ADZUNA_APP_KEY in .env. ADZUNA_COUNTRY is a comma-separated
// list of country codes (default: a worldwide spread). Adzuna supports:
// gb us at au br ca de es fr in it mx nl nz pl sg za.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { fetchJson, errResult, SEARCH_TERMS } from "./common";

const COUNTRIES = (process.env.ADZUNA_COUNTRY || "us,gb,in,ca,au,de")
  .split(",")
  .map((c) => c.trim().toLowerCase())
  .filter(Boolean);

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanAdzuna(): Promise<ScanResult> {
  const id = process.env.ADZUNA_APP_ID;
  const key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return errResult("adzuna", new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set"));

  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();

  for (const country of COUNTRIES) {
    for (const term of SEARCH_TERMS) {
      try {
        const url =
          `https://api.adzuna.com/v1/api/jobs/${country}/search/1` +
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
          company: `adzuna:${country}:${term}`,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }
  return { jobs, scannedCompanies: COUNTRIES.length * SEARCH_TERMS.length, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
