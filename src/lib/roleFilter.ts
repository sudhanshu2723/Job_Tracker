// Shared role + experience-level filtering, used by every job source
// (ATS scanner and JobSpy scanner) so results are consistent.

import { TITLE_FILTER, EXPERIENCE } from "./portals";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const POSITIVE_RE = TITLE_FILTER.positive.map((k) => new RegExp(`\\b${escape(k)}\\b`, "i"));
const NEGATIVE_RE = TITLE_FILTER.negative.map((k) => new RegExp(`\\b${escape(k)}\\b`, "i"));
const SENIOR_RE = EXPERIENCE.seniorMarkers.map((s) => new RegExp(`\\b${escape(s)}\\b`, "i"));
const ENTRY_RE = EXPERIENCE.entrySignals.map((s) => new RegExp(`\\b${escape(s)}\\b`, "i"));

/** Does the title match a target role (and not an excluded one)? */
export function matchesRole(title: string): boolean {
  return POSITIVE_RE.some((re) => re.test(title)) && !NEGATIVE_RE.some((re) => re.test(title));
}

/** Smallest required years-of-experience mentioned, or null if none found. */
function minYears(text: string): number | null {
  const YRS = "(?:years?|yrs?|yoe)";
  const patterns = [
    new RegExp(`(\\d{1,2})\\s*\\+\\s*${YRS}`, "gi"),
    new RegExp(`(\\d{1,2})\\s*(?:-|–|to)\\s*\\d{1,2}\\s*${YRS}`, "gi"),
    new RegExp(`(\\d{1,2})\\s*${YRS}[^.]{0,25}experience`, "gi"),
    new RegExp(`experience[^.]{0,25}(\\d{1,2})\\s*${YRS}`, "gi"),
  ];
  let min: number | null = null;
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && (min === null || n < min)) min = n;
    }
  }
  return min;
}

/** Keep only fresher / entry-level roles (when EXPERIENCE.fresherOnly is on). */
export function isFresher(title: string, description: string): boolean {
  if (SENIOR_RE.some((re) => re.test(title))) return false; // senior title → out
  if (ENTRY_RE.some((re) => re.test(title))) return true; // entry-level title → in
  const y = minYears(`${title} ${description}`); // required years decides the rest
  if (y !== null) return y <= EXPERIENCE.maxYears;
  return true; // no signal either way & not senior → keep
}
