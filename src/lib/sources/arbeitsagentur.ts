// Bundesagentur für Arbeit (German Federal Employment Agency) — official
// "Jobsuche" API. No signup: a static public key header unlocks it.
// https://jobsuche.api.bund.dev  ·  Huge Germany/EU dataset.
import type { ScanResult, ScannedJob } from "../scanner";
import { matchesRole } from "../roleFilter";
import { fetchJson, errResult, SEARCH_TERMS } from "./common";

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs";
const HEADERS = { "X-API-Key": "jobboerse-jobsuche" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanArbeitsagentur(): Promise<ScanResult> {
  const jobs: ScannedJob[] = [];
  const errors: ScanResult["errors"] = [];
  const seen = new Set<string>();

  for (const term of SEARCH_TERMS) {
    try {
      const url = `${BASE}?was=${encodeURIComponent(term)}&size=100&page=1`;
      const data = await fetchJson(url, { headers: HEADERS });
      for (const r of data?.stellenangebote ?? []) {
        const refnr = r.refnr ?? "";
        const role = r.titel ?? r.beruf ?? "";
        if (!refnr || !role) continue;
        const link = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;
        if (seen.has(link)) continue;
        if (!matchesRole(role)) continue;
        seen.add(link);
        const ort = r.arbeitsort?.ort;
        const land = r.arbeitsort?.land;
        jobs.push({
          company: r.arbeitgeber ?? "",
          role,
          link,
          location: [ort, land].filter(Boolean).join(", ") || "Germany",
        });
      }
    } catch (err) {
      errors.push({
        company: `arbeitsagentur:${term}`,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  }
  return { jobs, scannedCompanies: SEARCH_TERMS.length, errors };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
