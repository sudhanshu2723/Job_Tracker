import type { Application } from "./types";

const STORAGE_KEY = "jobtracker.applications.v1";
const THEME_KEY = "jobtracker.theme.v1";

export function loadApplications(): Application[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Application[];
  } catch {
    return [];
  }
}

export function saveApplications(apps: Application[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
}

export function hasStoredData(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) !== null;
}

export type ThemePref = "light" | "dark" | null;

export function loadTheme(): ThemePref {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function saveTheme(theme: ThemePref): void {
  if (typeof window === "undefined") return;
  if (theme) window.localStorage.setItem(THEME_KEY, theme);
  else window.localStorage.removeItem(THEME_KEY);
}

// ---- Export / import helpers ----

export function downloadJSON(apps: Application[]): void {
  const blob = new Blob([JSON.stringify(apps, null, 2)], {
    type: "application/json",
  });
  triggerDownload(blob, `job-applications-${today()}.json`);
}

const CSV_COLUMNS: (keyof Application)[] = [
  "company",
  "role",
  "location",
  "source",
  "dateApplied",
  "referral",
  "referrer",
  "status",
  "ctc",
  "followUp",
  "link",
  "notes",
];

export function downloadCSV(apps: Application[]): void {
  const header = CSV_COLUMNS.join(",");
  const rows = apps.map((a) =>
    CSV_COLUMNS.map((c) => csvCell(a[c])).join(","),
  );
  const blob = new Blob([[header, ...rows].join("\r\n")], {
    type: "text/csv",
  });
  triggerDownload(blob, `job-applications-${today()}.csv`);
}

export function parseImportedJSON(text: string): Application[] | null {
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (a) => a && typeof a === "object" && "company" in a && "status" in a,
    ) as Application[];
  } catch {
    return null;
  }
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
