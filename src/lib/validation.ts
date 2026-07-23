import { z } from "zod";

// ── Reusable fields (with normalization) ─────────────────────────────
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address.");

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters.")
  .max(30, "Username must be at most 30 characters.")
  .regex(/^[a-z0-9_.-]+$/, "Username: letters, numbers, . _ - only.");

// bcrypt silently truncates at 72 bytes — cap there.
export const passwordField = z
  .string()
  .min(6, "Password must be at least 6 characters.")
  .max(72, "Password is too long (max 72 characters).");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

// ── Auth ─────────────────────────────────────────────────────────────
export const registerSchema = z.object({
  email: emailField,
  username: usernameField,
  password: passwordField,
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(72),
});

export const verifySchema = z.object({
  email: emailField,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

// ── Social ───────────────────────────────────────────────────────────
export const friendSchema = z.object({ toUsername: usernameField });

export const inviteSchema = z.object({
  toUsername: usernameField,
  fromDate: isoDate,
  toDate: isoDate,
});

// ── Applications ─────────────────────────────────────────────────────
const STATUS = [
  "wishlist",
  "applied",
  "oa",
  "phone",
  "interview",
  "offer",
  "rejected",
  "ghosted",
] as const;

const optDate = z
  .string()
  .max(10)
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date.")
  .optional()
  .default("");

export const applicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(200),
  role: z.string().trim().min(1, "Role is required.").max(200),
  location: z.string().max(200).optional().default(""),
  country: z.string().max(80).optional().default(""),
  source: z.string().max(120).optional().default(""),
  dateApplied: optDate,
  referral: z.boolean().optional().default(false),
  referrer: z.string().max(120).optional().default(""),
  status: z.enum(STATUS).optional().default("applied"),
  ctc: z.string().max(60).optional().default(""),
  link: z.string().max(2000).optional().default(""),
  followUp: optDate,
  notes: z.string().max(5000).optional().default(""),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

// Import payload: bound the array size to avoid huge bodies.
export const importSchema = z.array(applicationSchema.partial().passthrough()).max(2000);

// ── Helper ───────────────────────────────────────────────────────────
export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): ParseResult<T> {
  const r = schema.safeParse(data);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Invalid input." };
}
