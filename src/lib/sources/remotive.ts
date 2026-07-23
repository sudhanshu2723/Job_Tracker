// Remotive — official free API (no key). https://remotive.com/api/remote-jobs
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanRemotive(): Promise<ScanResult> {
  try {
    const data = await fetchJson(
      "https://remotive.com/api/remote-jobs?category=software-dev&limit=250",
    );
    return collect(data?.jobs ?? [], (j: any) => ({
      company: j.company_name ?? "",
      role: j.title ?? "",
      link: j.url ?? "",
      location: j.candidate_required_location || "Remote",
    }));
  } catch (err) {
    return errResult("remotive", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
