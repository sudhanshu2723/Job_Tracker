import type { Application, StatusKey } from "./types";

export interface Kpis {
  totalApplied: number;
  responseRate: number; // 0..1
  interviews: number;
  offers: number;
  referrals: number;
  followUpsDue: number;
  active: number;
}

const RESPONDED: StatusKey[] = ["oa", "phone", "interview", "offer", "rejected"];
const REACHED_INTERVIEW: StatusKey[] = ["phone", "interview", "offer"];
const ACTIVE: StatusKey[] = ["applied", "oa", "phone", "interview"];
const CLOSED: StatusKey[] = ["offer", "rejected", "ghosted"];

export function computeKpis(apps: Application[], todayStr: string): Kpis {
  const submitted = apps.filter((a) => a.status !== "wishlist");
  const totalApplied = submitted.length;
  const responded = submitted.filter((a) => RESPONDED.includes(a.status)).length;

  return {
    totalApplied,
    responseRate: totalApplied ? responded / totalApplied : 0,
    interviews: apps.filter((a) => REACHED_INTERVIEW.includes(a.status)).length,
    offers: apps.filter((a) => a.status === "offer").length,
    referrals: apps.filter((a) => a.referral).length,
    active: apps.filter((a) => ACTIVE.includes(a.status)).length,
    followUpsDue: apps.filter((a) => isFollowUpDue(a, todayStr)).length,
  };
}

export function isFollowUpDue(app: Application, todayStr: string): boolean {
  if (!app.followUp) return false;
  if (CLOSED.includes(app.status) || app.status === "wishlist") return false;
  return app.followUp <= todayStr;
}

export function countByStatus(apps: Application[]): Record<StatusKey, number> {
  const counts = {
    wishlist: 0,
    applied: 0,
    oa: 0,
    phone: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    ghosted: 0,
  } as Record<StatusKey, number>;
  for (const a of apps) counts[a.status]++;
  return counts;
}

export function countBySource(apps: Application[]): { source: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of apps) {
    const key = a.source || "Other";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);
}

/** Whole days between an ISO date and today (today = 0). */
export function daysAgo(iso: string, todayStr: string): number {
  if (!iso) return 0;
  const then = Date.parse(iso);
  const now = Date.parse(todayStr);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  return Math.round((now - then) / 86_400_000);
}
