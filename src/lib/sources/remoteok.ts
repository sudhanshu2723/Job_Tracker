// RemoteOK — free JSON feed (no key; needs a UA header). https://remoteok.com/api
import type { ScanResult } from "../scanner";
import { fetchJson, collect, errResult } from "./common";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function scanRemoteOk(): Promise<ScanResult> {
  try {
    const data = await fetchJson("https://remoteok.com/api", {
      headers: { "User-Agent": "Mozilla/5.0 (JobTracker)" },
    });
    // First element is a legal/metadata object — keep only real postings.
    const items = (Array.isArray(data) ? data : []).filter((x: any) => x?.position || x?.title);
    return collect(items, (j: any) => ({
      company: j.company ?? "",
      role: j.position ?? j.title ?? "",
      link: j.url ?? "",
      location: j.location || "Remote",
    }));
  } catch (err) {
    return errResult("remoteok", err);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
