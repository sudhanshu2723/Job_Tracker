// LinkedIn + Indeed scanner via ts-jobspy. Best-effort: wrapped so failures
// (rate limits, IP blocks) never break the reliable ATS scan.
// NOTE: scraping LinkedIn/Indeed can violate their ToS and is often blocked on
// datacenter IPs — run this locally / with proxies for reliable results.

import { scrapeJobs } from "ts-jobspy";
import { JOBSPY } from "./portals";
import { matchesRole, isFresher } from "./roleFilter";
import type { ScannedJob, ScanResult } from "./scanner";

// Stop launching new searches past this wall-clock budget (keeps the cron under
// its maxDuration even if a board hangs).
const TIME_BUDGET_MS = 40_000;

export async function scanJobSpy(): Promise<ScanResult> {
  const jobs: ScannedJob[] = [];
  const errors: { company: string; error: string }[] = [];
  const seen = new Set<string>();
  const started = Date.now();

  for (const term of JOBSPY.searchTerms) {
    if (Date.now() - started > TIME_BUDGET_MS) {
      errors.push({ company: "jobspy", error: `time budget hit before "${term}"` });
      break;
    }
    try {
      const results = await scrapeJobs({
        siteName: ["linkedin", "indeed"],
        searchTerm: term,
        location: JOBSPY.location,
        countryIndeed: JOBSPY.countryIndeed,
        resultsWanted: JOBSPY.resultsWanted,
      });

      for (const j of results) {
        const link = j.jobUrl || j.jobUrlDirect || "";
        const role = j.title || "";
        if (!link || !role || seen.has(link)) continue;
        if (!matchesRole(role)) continue;
        if (!isFresher(role, j.description ?? "")) continue;
        seen.add(link);
        jobs.push({
          company: j.company || j.site || "",
          role,
          link,
          location: j.location || "",
        });
      }
    } catch (err) {
      errors.push({
        company: `jobspy:${term}`,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }

  return { jobs, scannedCompanies: JOBSPY.searchTerms.length, errors };
}
