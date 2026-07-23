import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

// POST /api/auth/verify — check the OTP, create the account, sign in.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const code = String(body?.code ?? "").trim();

  const pending = await prisma.signupOtp.findUnique({ where: { email } });
  if (!pending) {
    return NextResponse.json({ error: "No pending signup — start again." }, { status: 400 });
  }
  if (pending.expiresAt < new Date()) {
    return NextResponse.json({ error: "Code expired — request a new one." }, { status: 400 });
  }
  if (pending.code !== code) {
    return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.create({
      data: { email, username: pending.username, passwordHash: pending.passwordHash },
      select: { id: true, username: true },
    });
  } catch {
    return NextResponse.json(
      { error: "That email or username was just taken." },
      { status: 409 },
    );
  }
  await prisma.signupOtp.delete({ where: { email } }).catch(() => {});

  const token = await signSession({ userId: user.id, username: user.username });
  const res = NextResponse.json({ username: user.username }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
