import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { parseBody, loginSchema } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// A real bcrypt hash to compare against when the email is unknown, so login
// takes the same time whether or not the email exists (no timing/enumeration).
const DUMMY_HASH = bcrypt.hashSync("unused-placeholder-password", 10);

// POST /api/auth/login — email + password
export async function POST(req: Request) {
  const ipLimited = await enforceRateLimit(req, "login-ip", 12, 60);
  if (ipLimited) return ipLimited;

  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseBody(loginSchema, body);
  if (!parsed.ok) return invalid();
  const { email, password } = parsed.data;

  const emailLimited = await enforceRateLimit(req, "login-email", 6, 300, email);
  if (emailLimited) return emailLimited;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return invalid();

  const token = await signSession({ userId: user.id, username: user.username });
  const res = NextResponse.json({ username: user.username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
