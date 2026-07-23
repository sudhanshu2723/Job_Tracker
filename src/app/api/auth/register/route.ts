import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendOtp } from "@/lib/email";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60 * 1000;

// POST /api/auth/register — validate details, send an email OTP, stash pending signup.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (username.length < 3 || username.length > 30 || !/^[a-z0-9_.-]+$/.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–30 chars: letters, numbers, . _ -" },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const [emailTaken, nameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (emailTaken) return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  if (nameTaken) return NextResponse.json({ error: "That username is taken." }, { status: 409 });

  const code = String(randomInt(100000, 1000000)); // 6 digits
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.signupOtp.upsert({
    where: { email },
    create: { email, username, passwordHash, code, expiresAt },
    update: { username, passwordHash, code, expiresAt },
  });

  await sendOtp(email, code);
  return NextResponse.json({ pending: true, email });
}
