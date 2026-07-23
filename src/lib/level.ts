// Lightweight, client-safe experience-level classifier from a job title.
// Binary: a title is "experienced" if it carries a seniority marker, else "fresher".

const SENIOR =
  /\b(senior|sr|staff|principal|lead|distinguished|architect|manager|director|head|vp|expert|ii|iii|iv)\b/i;

export type RoleLevel = "fresher" | "experienced";

export function roleLevel(title: string): RoleLevel {
  return SENIOR.test(title) ? "experienced" : "fresher";
}

/** Does a role match the chosen level filter? fresher = NOT senior. */
export function matchesLevel(title: string, filter: "all" | "fresher" | "experienced"): boolean {
  if (filter === "all") return true;
  return filter === "experienced" ? SENIOR.test(title) : !SENIOR.test(title);
}
