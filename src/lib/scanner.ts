// Zero-cost job-portal scanner. Hits Greenhouse / Ashby / Lever public JSON APIs
// directly (no AI, no browser), filters by role keywords + experience level,
// dedupes within the run.
// Ported/adapted from the MIT-licensed career-ops project (santifer/career-ops).

import { PORTALS, EXPERIENCE, type Portal } from "./portals";
import { matchesRole, isFresher } from "./roleFilter";

export interface ScannedJob {
  company: string;
  role: string; // job title
  link: string; // absolute apply/posting URL
  location: string;
}

interface ParsedJob extends ScannedJob {
  description: string; // used only for filtering, never stored
}

type ApiKind = "greenhouse" | "ashby" | "lever";
interface DetectedApi {
  type: ApiKind;
  url: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const CONCURRENCY = 8;

function detectApi(portal: Portal): DetectedApi | null {
  // Greenhouse — request content=true so descriptions come back for filtering.
  if (portal.api && portal.api.includes("greenhouse")) {
    return { type: "greenhouse", url: `${portal.api}?content=true` };
  }
  const url = portal.careersUrl || "";

  const ashby = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
  if (ashby) {
    return {
      type: "ashby",
      url: `https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}?includeCompensation=true`,
    };
  }
  const lever = url.match(/jobs\.lever\.co\/([^/?#]+)/);
  if (lever) {
    return { type: "lever", url: `https://api.lever.co/v0/postings/${lever[1]}` };
  }
  const gh = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
  if (gh) {
    return {
      type: "greenhouse",
      url: `https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs?content=true`,
    };
  }
  return null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseGreenhouse(json: any, company: string): ParsedJob[] {
  return (json?.jobs ?? []).map((j: any) => ({
    company,
    role: j.title ?? "",
    link: j.absolute_url ?? "",
    location: j.location?.name ?? "",
    description: j.content ?? "",
  }));
}
function parseAshby(json: any, company: string): ParsedJob[] {
  return (json?.jobs ?? []).map((j: any) => ({
    company,
    role: j.title ?? "",
    link: j.jobUrl ?? "",
    location: j.location ?? "",
    description: j.descriptionPlain ?? j.descriptionHtml ?? "",
  }));
}
function parseLever(json: any, company: string): ParsedJob[] {
  if (!Array.isArray(json)) return [];
  return json.map((j: any) => {
    const lists = Array.isArray(j.lists)
      ? j.lists.map((l: any) => `${l.text ?? ""} ${l.content ?? ""}`).join(" ")
      : "";
    return {
      company,
      role: j.text ?? "",
      link: j.hostedUrl ?? "",
      location: j.categories?.location ?? "",
      description: `${j.descriptionPlain ?? j.description ?? ""} ${lists}`,
    };
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const PARSERS: Record<ApiKind, (json: unknown, company: string) => ParsedJob[]> = {
  greenhouse: parseGreenhouse,
  ashby: parseAshby,
  lever: parseLever,
};

// ── Fetch ───────────────────────────────────────────────────────────
async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function parallel<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) results.push(await tasks[i++]());
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()));
  return results;
}

export interface ScanResult {
  jobs: ScannedJob[];
  scannedCompanies: number;
  errors: { company: string; error: string }[];
}

/** Scan all configured portals; return matching, fresher-level, deduped jobs. */
export async function scanPortals(): Promise<ScanResult> {
  const targets = PORTALS.map((p) => ({ portal: p, api: detectApi(p) })).filter(
    (t): t is { portal: Portal; api: DetectedApi } => t.api !== null,
  );

  const seenLinks = new Set<string>();
  const jobs: ScannedJob[] = [];
  const errors: { company: string; error: string }[] = [];

  const tasks = targets.map(({ portal, api }) => async () => {
    try {
      const json = await fetchJson(api.url);
      for (const job of PARSERS[api.type](json, portal.name)) {
        if (!job.link || !job.role) continue;
        if (!matchesRole(job.role)) continue;
        if (EXPERIENCE.fresherOnly && !isFresher(job.role, job.description)) continue;
        if (seenLinks.has(job.link)) continue;
        seenLinks.add(job.link);
        jobs.push({
          company: job.company,
          role: job.role,
          link: job.link,
          location: job.location,
        });
      }
    } catch (err) {
      errors.push({
        company: portal.name,
        error: err instanceof Error ? err.message : "unknown",
      });
    }
  });

  await parallel(tasks, CONCURRENCY);
  return { jobs, scannedCompanies: targets.length, errors };
}
