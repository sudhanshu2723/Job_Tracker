import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  signSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/auth/login — email + password
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  if (!email || !password) return invalid();

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return invalid();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid();

  const token = await signSession({ userId: user.id, username: user.username });
  const res = NextResponse.json({ username: user.username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
