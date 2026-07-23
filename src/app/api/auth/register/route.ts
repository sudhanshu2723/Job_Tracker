import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword, hashOtp } from "@/lib/auth";
import { sendOtp } from "@/lib/email";
import { parseBody, registerSchema } from "@/lib/validation";
import { enforceRateLimit } from "@/lib/rateLimit";
import { CHANNEL_USERNAMES } from "@/lib/channelsMeta";

export const runtime = "nodejs";

const OTP_TTL_MS = 10 * 60 * 1000;

// POST /api/auth/register — validate, send an email OTP, stash pending signup.
export async function POST(req: Request) {
  const ipLimited = await enforceRateLimit(req, "register-ip", 8, 60);
  if (ipLimited) return ipLimited;

  const body = await req.json().catch(() => null);
  const parsed = parseBody(registerSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { email, username, password, isChannel, channelLabel, channelDescription } = parsed.data;

  // Reserved feed/bot usernames can never be registered (prevents channel squatting).
  if (CHANNEL_USERNAMES.has(username)) {
    return NextResponse.json({ error: "That username is reserved." }, { status: 409 });
  }

  // Resend cooldown per email — limits OTP email-bombing / sender abuse.
  const emailLimited = await enforceRateLimit(req, "register-email", 3, 600, email);
  if (emailLimited) return emailLimited;

  const [emailTaken, nameTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { username } }),
  ]);
  if (emailTaken)
    return NextResponse.json({ error: "That email is already registered." }, { status: 409 });
  if (nameTaken) return NextResponse.json({ error: "That username is taken." }, { status: 409 });

  const code = String(randomInt(100000, 1000000)); // 6 digits
  const passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const channelFields = {
    isChannel,
    channelLabel: isChannel ? channelLabel.trim() : null,
    channelDescription: isChannel ? channelDescription.trim() : null,
  };
  await prisma.signupOtp.upsert({
    where: { email },
    create: { email, username, passwordHash, code: hashOtp(code), expiresAt, ...channelFields },
    update: { username, passwordHash, code: hashOtp(code), expiresAt, ...channelFields },
  });

  await sendOtp(email, code);
  return NextResponse.json({ pending: true, email });
}
