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
} as const;

/** Coerce an untrusted request body into a safe, complete draft. */
export function sanitizeDraft(body: unknown): ApplicationDraft {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, fallback = "") =>
    typeof v === "string" ? v : v == null ? fallback : String(v);
  return {
    company: str(b.company),
    role: str(b.role),
    location: str(b.location),
    country: str(b.country),
    source: str(b.source),
    dateApplied: str(b.dateApplied),
    referral: Boolean(b.referral),
    referrer: str(b.referrer),
    status: toStatus(b.status),
    ctc: str(b.ctc),
    link: str(b.link),
    followUp: str(b.followUp),
    notes: str(b.notes),
  };
}
