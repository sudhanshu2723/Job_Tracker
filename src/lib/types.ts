// Core data model for the job application tracker.

export type StatusKey =
  | "wishlist"
  | "applied"
  | "oa"
  | "phone"
  | "interview"
  | "offer"
  | "rejected"
  | "ghosted";

export interface StatusMeta {
  key: StatusKey;
  label: string;
  /** CSS custom property that holds this status's color. */
  varName: string;
  /** Part of the forward-moving pipeline (excludes terminal outcomes). */
  pipeline: boolean;
}

/** Ordered so the pipeline chart reads top-to-bottom like a funnel. */
export const STATUSES: StatusMeta[] = [
  { key: "wishlist", label: "Wishlist", varName: "--st-wishlist", pipeline: false },
  { key: "applied", label: "Applied", varName: "--st-applied", pipeline: true },
  { key: "oa", label: "OA / Assessment", varName: "--st-oa", pipeline: true },
  { key: "phone", label: "Phone Screen", varName: "--st-phone", pipeline: true },
  { key: "interview", label: "Interview", varName: "--st-interview", pipeline: true },
  { key: "offer", label: "Offer", varName: "--st-offer", pipeline: true },
  { key: "rejected", label: "Rejected", varName: "--st-rejected", pipeline: false },
  { key: "ghosted", label: "Ghosted", varName: "--st-ghosted", pipeline: false },
];

export const STATUS_BY_KEY: Record<StatusKey, StatusMeta> = Object.fromEntries(
  STATUSES.map((s) => [s.key, s]),
) as Record<StatusKey, StatusMeta>;

/** Common application sources; used to power the datalist and filters. */
export const SOURCES = [
  "LinkedIn",
  "Naukri",
  "Indeed",
  "Foundit",
  "Wellfound",
  "Instahyre",
  "Cutshort",
  "Company Site",
  "Greenhouse",
  "Lever",
  "Referral",
  "Other",
];

/** The user-editable fields of an application. */
export interface ApplicationDraft {
  company: string;
  role: string;
  location: string;
  source: string;
  /** ISO date string, YYYY-MM-DD. */
  dateApplied: string;
  referral: boolean;
  referrer: string;
  status: StatusKey;
  ctc: string;
  link: string;
  /** ISO date string, YYYY-MM-DD, or empty. */
  followUp: string;
  notes: string;
}

export interface Application extends ApplicationDraft {
  id: string;
  /** Username of the friend this posting was shared from (null/absent if self-created). */
  sharedFrom?: string | null;
}
