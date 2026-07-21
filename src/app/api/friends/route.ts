import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { existingFriendship, acceptFriendship } from "@/lib/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

// GET /api/friends — accepted friends + pending requests
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const me = session.userId;

  const rows = await prisma.friendship.findMany({
    where: { OR: [{ requesterId: me }, { addresseeId: me }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      requesterId: true,
      addresseeId: true,
      requester: { select: { username: true } },
      addressee: { select: { username: true } },
    },
  });

  const friends = rows
    .filter((f) => f.status === "accepted")
    .map((f) => ({
      id: f.id,
      username: f.requesterId === me ? f.addressee.username : f.requester.username,
    }));
  const incoming = rows
    .filter((f) => f.status === "pending" && f.addresseeId === me)
    .map((f) => ({ id: f.id, from: f.requester.username }));
  const outgoing = rows
    .filter((f) => f.status === "pending" && f.requesterId === me)
    .map((f) => ({ id: f.id, to: f.addressee.username }));

  return NextResponse.json({ friends, incoming, outgoing });
}

// POST /api/friends — send a friend request (auto-accepts a reciprocal one)
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const toUsername = String(body?.toUsername ?? "").trim().toLowerCase();
  if (!toUsername) return NextResponse.json({ error: "Enter a username." }, { status: 400 });

  const other = await prisma.user.findUnique({ where: { username: toUsername } });
  if (!other) return NextResponse.json({ error: "No user with that username." }, { status: 404 });
  if (other.id === session.userId)
    return NextResponse.json({ error: "You can't friend yourself." }, { status: 400 });

  const existing = await existingFriendship(session.userId, other.id);
  if (existing) {
    if (existing.status === "accepted")
      return NextResponse.json({ error: "You're already friends." }, { status: 409 });
    // A pending request from THEM to me → accept it now (mutual).
    if (existing.addresseeId === session.userId) {
      await acceptFriendship(existing.id, existing.requesterId, session.userId);
      return NextResponse.json({ ok: true, becameFriends: true });
    }
    return NextResponse.json({ error: "Request already sent." }, { status: 409 });
  }

  await prisma.friendship.create({
    data: { requesterId: session.userId, addresseeId: other.id },
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
