// The Muse — free public API (no key). Global roles from thousands of companies.
// https://www.themuse.com/developers/api/v2
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { fetchJson, errResult } from "./common";

// Tech-relevant Muse categories + how many pages (20 jobs each) to pull.
const QUERIES: { category: string; pages: number }[] = [
  { category: "Software Engineering", pages: 3 },
  { category: "Data Science", pages: 1 },
  { category: "Data and Analytics", pages: 1 },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanThemuse(): Promise<ScanResult> {
  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();

  for (const q of QUERIES) {
    for (let page = 1; page <= q.pages; page++) {
      try {
        const url =
          `https://www.themuse.com/api/public/jobs?page=${page}` +
          `&category=${encodeURIComponent(q.category)}`;
        const data = await fetchJson(url);
        for (const r of data?.results ?? []) {
          const link = r.refs?.landing_page ?? "";
          const role = r.name ?? "";
          if (!link || !role || seen.has(link)) continue;
          if (!matchesRole(role)) continue;
          seen.add(link);
          jobs.push({
            company: r.company?.name ?? "",
            role,
            link,
            location: r.locations?.[0]?.name ?? "Remote",
          });
        }
      } catch (err) {
        errors.push({
          company: `themuse:${q.category}:${page}`,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }
  }
  return { jobs, scannedCompanies: QUERIES.length, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
