import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

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

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "That username is taken." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { username, passwordHash: await hashPassword(password) },
    select: { id: true, username: true },
  });

  const token = await signSession({ userId: user.id, username: user.username });
  const res = NextResponse.json({ username: user.username }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
