// Shared helpers for API-based job sources (no scraping). These channels keep
// the role-keyword match but NOT the fresher filter — the user filters level
// themselves in the dashboard.

import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";

/** Role search terms used by the keyword-query sources (Adzuna, Jooble). */
export const SEARCH_TERMS = [
  "Software Engineer",
  "Backend Developer",
  "Full Stack Developer",
  "Frontend Developer",
  "Machine Learning Engineer",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Map raw items → ScannedJob, keep role-matches, dedupe by link. */
export function collect<T>(items: T[], map: (it: T) => ScannedJob): ScanResult {
  const jobs: ScannedJob[] = [];
  const seen = new Set<string>();
  for (const it of items ?? []) {
    const j = map(it);
    if (!j.link || !j.role || seen.has(j.link)) continue;
    if (!matchesRole(j.role)) continue;
    seen.add(j.link);
    jobs.push(j);
  }
  return { jobs, scannedCompanies: 1, errors: [] };
}

export function errResult(source: string, err: unknown): ScanResult {
  return {
    jobs: [],
    scannedCompanies: 1,
    errors: [{ company: source, error: err instanceof Error ? err.message : "unknown" }],
  };
}
