// Working Nomads — free public feed (no key). Remote roles worldwide.
// https://www.workingnomads.com/api/exposed_jobs/
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanWorkingNomads(): Promise<ScanResult> {
  try {
    const data = await fetchJson("https://www.workingnomads.com/api/exposed_jobs/");
    return collect(Array.isArray(data) ? data : [], (j: any) => ({
      company: j.company_name ?? "",
      role: j.title ?? "",
      link: j.url ?? "",
      location: j.location || "Remote",
    }));
  } catch (err) {
    return errResult("workingnomads", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
