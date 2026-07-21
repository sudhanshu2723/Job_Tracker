import { prisma } from "./prisma";
import { scanPortals, type ScannedJob } from "./scanner";
import { scanJobSpy } from "./jobspyScanner";
import { JOBSPY } from "./portals";
import { ensureBotUser } from "./bot";
import { fanoutManyToFriends } from "./sharing";

export interface DailyScanSummary {
  scannedCompanies: number;
  atsMatches: number;
  jobspyMatches: number;
  totalMatches: number;
  added: number;
  syncedCopies: number;
  errors: number;
}

/**
 * The daily job: scan the ATS portals (always) plus LinkedIn/Indeed via JobSpy
 * (when enabled), add brand-new postings to the career_ops bot's list, and fan
 * those out to everyone friended with the bot.
 */
export async function runDailyScan(): Promise<DailyScanSummary> {
  const bot = await ensureBotUser();

  const ats = await scanPortals();

  const jobspy: {
    jobs: ScannedJob[];
    scannedCompanies: number;
    errors: { company: string; error: string }[];
  } = { jobs: [], scannedCompanies: 0, errors: [] };
  if (JOBSPY.enabled) {
    try {
      const r = await scanJobSpy();
      jobspy.jobs = r.jobs;
      jobspy.scannedCompanies = r.scannedCompanies;
      jobspy.errors = r.errors;
    } catch {
      jobspy.errors.push({ company: "jobspy", error: "scan failed" });
    }
  }

  // Merge both sources, deduped by link.
  const seen = new Set<string>();
  const merged: ScannedJob[] = [];
  for (const j of [...ats.jobs, ...jobspy.jobs]) {
    if (j.link && !seen.has(j.link)) {
      seen.add(j.link);
      merged.push(j);
    }
  }

  // Dedupe against what the bot already collected (by link).
  const existing = await prisma.application.findMany({
    where: { userId: bot.id },
    select: { link: true },
  });
  const known = new Set(existing.map((e) => e.link).filter(Boolean));
  const fresh = merged.filter((j) => j.link && !known.has(j.link));

  const summaryBase = {
    scannedCompanies: ats.scannedCompanies + jobspy.scannedCompanies,
    atsMatches: ats.jobs.length,
    jobspyMatches: jobspy.jobs.length,
    totalMatches: merged.length,
    errors: ats.errors.length + jobspy.errors.length,
  };

  if (fresh.length === 0) {
    return { ...summaryBase, added: 0, syncedCopies: 0 };
  }

  await prisma.application.createMany({
    data: fresh.map((j) => ({
      userId: bot.id,
      company: j.company,
      role: j.role,
      link: j.link,
      location: j.location,
      status: "wishlist",
      source: "career-ops scan",
    })),
    skipDuplicates: true,
  });

  const added = await prisma.application.findMany({
    where: { userId: bot.id, link: { in: fresh.map((j) => j.link) } },
    select: { id: true, company: true, role: true, link: true, location: true },
  });

  const syncedCopies = await fanoutManyToFriends(bot.id, bot.username, added);

  return { ...summaryBase, added: added.length, syncedCopies };
}
