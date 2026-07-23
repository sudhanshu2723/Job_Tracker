// Server-side channel registry: maps each channel to its source scanner.
// (Heavy scanner imports live here — do NOT import this on the client; use
// channelsMeta.ts there instead.)

import { CHANNEL_META, type ChannelMeta } from "./channelsMeta";
import { scanPortals, type ScannedJob, type ScanResult } from "./scanner";
import { scanJobSpy } from "./jobspyScanner";
import { scanRemotive } from "./sources/remotive";
import { scanArbeitnow } from "./sources/arbeitnow";
import { scanRemoteOk } from "./sources/remoteok";
import { scanJobicy } from "./sources/jobicy";
import { scanAdzuna } from "./sources/adzuna";
import { scanJooble } from "./sources/jooble";
import { JOBSPY } from "./portals";

export interface Channel extends ChannelMeta {
  scan: () => Promise<ScanResult>;
}

// career_ops = the original ATS boards + LinkedIn/Indeed (JobSpy) combined feed.
async function scanCareerOps(): Promise<ScanResult> {
  const ats = await scanPortals();

  let jobspyJobs: ScannedJob[] = [];
  let jobspyErrors: ScanResult["errors"] = [];
  let jobspyCompanies = 0;
  if (JOBSPY.enabled) {
    try {
      const r = await scanJobSpy();
      jobspyJobs = r.jobs;
      jobspyErrors = r.errors;
      jobspyCompanies = r.scannedCompanies;
    } catch {
      jobspyErrors = [{ company: "jobspy", error: "scan failed" }];
    }
  }

  const seen = new Set<string>();
  const jobs: ScannedJob[] = [];
  for (const j of [...ats.jobs, ...jobspyJobs]) {
    if (j.link && !seen.has(j.link)) {
      seen.add(j.link);
      jobs.push(j);
    }
  }
  return {
    jobs,
    scannedCompanies: ats.scannedCompanies + jobspyCompanies,
    errors: [...ats.errors, ...jobspyErrors],
  };
}

const SCANNERS: Record<string, () => Promise<ScanResult>> = {
  career_ops: scanCareerOps,
  remotive: scanRemotive,
  arbeitnow: scanArbeitnow,
  remoteok: scanRemoteOk,
  jobicy: scanJobicy,
  adzuna: scanAdzuna,
  jooble: scanJooble,
};

export const CHANNELS: Channel[] = CHANNEL_META.filter((m) => SCANNERS[m.username]).map((m) => ({
  ...m,
  scan: SCANNERS[m.username],
}));

export function getChannel(username: string): Channel | undefined {
  return CHANNELS.find((c) => c.username === username);
}
