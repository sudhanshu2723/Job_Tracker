// Arbeitnow — free job board API (no key). https://www.arbeitnow.com/api/job-board-api
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanArbeitnow(): Promise<ScanResult> {
  try {
    const data = await fetchJson("https://www.arbeitnow.com/api/job-board-api");
    return collect(data?.data ?? [], (j: any) => ({
      company: j.company_name ?? "",
      role: j.title ?? "",
      link: j.url ?? "",
      location: j.location || (j.remote ? "Remote" : ""),
    }));
  } catch (err) {
    return errResult("arbeitnow", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
