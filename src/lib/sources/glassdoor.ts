// Glassdoor — via jobspy-js. SCRAPER, so gated behind ENABLE_JOBSPY
// (runs locally, not on Vercel) like the LinkedIn/Indeed source.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { errResult } from "./common";

// Query Indian cities by name — "India" resolves to Indiana (US) in Glassdoor's
// location search, so we use unambiguous city names instead.
const CITIES = ["Bengaluru", "Mumbai", "Hyderabad", "Pune", "Delhi"];
const TERMS = ["software engineer", "backend developer"];
const TIME_BUDGET_MS = 45_000;

export async function scanGlassdoor(): Promise<ScanResult> {
  if (process.env.ENABLE_JOBSPY !== "true") {
    return errResult("glassdoor", new Error("scraper disabled (set ENABLE_JOBSPY=true)"));
  }

  // Lazy-load the WASM-heavy scraper only when actually running.
  const { scrapeJobs } = await import("jobspy-js");

  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();
  const started = Date.now();

  for (const city of CITIES) {
    for (const term of TERMS) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      try {
        const res = await scrapeJobs({
          site_name: ["glassdoor"],
          search_term: term,
          location: city,
          results_wanted: 15,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const j of (res?.jobs ?? []) as any[]) {
          const link = j.job_url || j.job_url_direct || "";
          const role = j.title || "";
          if (!link || !role || seen.has(link)) continue;
          if (!matchesRole(role)) continue;
          seen.add(link);
          jobs.push({ company: j.company || "", role, link, location: j.location || city });
        }
      } catch (err) {
        errors.push({
          company: `glassdoor:${city}:${term}`,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }
  return { jobs, scannedCompanies: CITIES.length * TERMS.length, errors };
}
