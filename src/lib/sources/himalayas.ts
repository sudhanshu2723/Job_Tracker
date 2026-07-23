// Himalayas — official remote-jobs API (no key; needs a UA header).
// https://himalayas.app/jobs/api
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanHimalayas(): Promise<ScanResult> {
  try {
    const data = await fetchJson("https://himalayas.app/jobs/api?limit=100", {
      headers: { "User-Agent": "Mozilla/5.0 (JobTracker)" },
    });
    return collect(data?.jobs ?? [], (j: any) => ({
      company: j.companyName ?? "",
      role: j.title ?? "",
      link:
        j.applicationLink ||
        j.guid ||
        (j.companySlug ? `https://himalayas.app/companies/${j.companySlug}/jobs` : ""),
      location: Array.isArray(j.locationRestrictions)
        ? j.locationRestrictions[0] || "Remote"
        : j.locationRestrictions || "Remote",
    }));
  } catch (err) {
    return errResult("himalayas", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
