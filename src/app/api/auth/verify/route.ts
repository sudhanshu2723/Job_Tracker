import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { signSession, sessionCookieOptions, SESSION_COOKIE, hashOtp } from "@/lib/auth";
import { parseBody, verifySchema } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// POST /api/auth/verify — check the OTP, create the account, sign in.
export async function POST(req: Request) {
  const ipLimited = await enforceRateLimit(req, "verify-ip", 15, 600);
  if (ipLimited) return ipLimited;

  const body = await req.json().catch(() => null);
  const parsed = parseBody(verifySchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, code } = parsed.data;

  // Per-email attempt cap — caps OTP brute-force.
  const emailLimited = await enforceRateLimit(req, "verify-email", 8, 600, email);
  if (emailLimited) return emailLimited;

  const pending = await prisma.signupOtp.findUnique({ where: { email } });
  if (!pending) {
    return NextResponse.json({ error: "No pending signup — start again." }, { status: 400 });
  }
  if (pending.expiresAt < new Date()) {
    await prisma.signupOtp.delete({ where: { email } }).catch(() => {});
    return NextResponse.json({ error: "Code expired — request a new one." }, { status: 400 });
  }
  if (!safeEqual(pending.code, hashOtp(code))) {
    return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        username: pending.username,
        passwordHash: pending.passwordHash,
        isChannel: pending.isChannel,
        channelLabel: pending.channelLabel,
        channelDescription: pending.channelDescription,
      },
      select: { id: true, username: true },
    });
  } catch {
    return NextResponse.json({ error: "That email or username was just taken." }, { status: 409 });
  }
  await prisma.signupOtp.delete({ where: { email } }).catch(() => {});

  const token = await signSession({ userId: user.id, username: user.username });
  const res = NextResponse.json({ username: user.username }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
