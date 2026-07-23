// Jobicy — free remote-jobs API (no key). https://jobicy.com/api/v2/remote-jobs
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanJobicy(): Promise<ScanResult> {
  try {
    const data = await fetchJson("https://jobicy.com/api/v2/remote-jobs?count=100");
    return collect(data?.jobs ?? [], (j: any) => ({
      company: j.companyName ?? "",
      role: j.jobTitle ?? "",
      link: j.url ?? "",
      location: j.jobGeo || "Remote",
    }));
  } catch (err) {
    return errResult("jobicy", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
