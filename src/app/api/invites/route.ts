import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

// GET /api/invites — pending invites involving me
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const [incoming, outgoing] = await Promise.all([
    prisma.invitation.findMany({
      where: { toUserId: session.userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fromDate: true, toDate: true, createdAt: true, fromUser: { select: { username: true } } },
    }),
    prisma.invitation.findMany({
      where: { fromUserId: session.userId, status: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, fromDate: true, toDate: true, toUser: { select: { username: true } } },
    }),
  ]);

  return NextResponse.json({
    incoming: incoming.map((i) => ({
      id: i.id,
      from: i.fromUser.username,
      fromDate: i.fromDate,
      toDate: i.toDate,
    })),
    outgoing: outgoing.map((i) => ({
      id: i.id,
      to: i.toUser.username,
      fromDate: i.fromDate,
      toDate: i.toDate,
    })),
  });
}

// POST /api/invites — send an invite (I will receive their postings on accept)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const toUsername = String(body?.toUsername ?? "").trim().toLowerCase();
  const fromDate = String(body?.fromDate ?? "");
  const toDate = String(body?.toDate ?? "");

  if (!toUsername) return NextResponse.json({ error: "Enter a username." }, { status: 400 });
  if (!fromDate || !toDate)
    return NextResponse.json({ error: "Pick a start and end date." }, { status: 400 });
  if (fromDate > toDate)
    return NextResponse.json({ error: "Start date must be before end date." }, { status: 400 });

  const toUser = await prisma.user.findUnique({ where: { username: toUsername } });
  if (!toUser) return NextResponse.json({ error: "No user with that username." }, { status: 404 });
  if (toUser.id === session.userId)
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 });

  await prisma.invitation.create({
    data: { fromUserId: session.userId, toUserId: toUser.id, fromDate, toDate },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
