import { STATUSES, type ApplicationDraft, type StatusKey } from "./types";

const VALID_STATUS = new Set<string>(STATUSES.map((s) => s.key));

function toStatus(v: unknown): StatusKey {
  return typeof v === "string" && VALID_STATUS.has(v) ? (v as StatusKey) : "applied";
}

/** Only the client-facing columns — never expose createdAt/updatedAt shape churn. */
export const APP_SELECT = {
  id: true,
  company: true,
  role: true,
  location: true,
  country: true,
  source: true,
  dateApplied: true,
  referral: true,
  referrer: true,
  status: true,
  ctc: true,
  link: true,
  followUp: true,
  notes: true,
  sharedFrom: true,
  createdAt: true,
} as const;

/** Length-capped string coercion. */
function cap(v: unknown, max: number): string {
  const s = typeof v === "string" ? v : v == null ? "" : String(v);
  return s.slice(0, max);
}

/** Only allow http(s) links — blocks javascript:/data: URLs (stored XSS). */
function safeLink(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https?:\/\//i.test(s) ? s.slice(0, 2000) : "";
}

/** Coerce an untrusted request body into a safe, complete, bounded draft. */
export function sanitizeDraft(body: unknown): ApplicationDraft {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    company: cap(b.company, 200),
    role: cap(b.role, 200),
    location: cap(b.location, 200),
    country: cap(b.country, 80),
    source: cap(b.source, 120),
    dateApplied: cap(b.dateApplied, 10),
    referral: Boolean(b.referral),
    referrer: cap(b.referrer, 120),
    status: toStatus(b.status),
    ctc: cap(b.ctc, 60),
    link: safeLink(b.link),
    followUp: cap(b.followUp, 10),
    notes: cap(b.notes, 5000),
  };
}
