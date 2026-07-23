import { NextResponse } from "next/server";
import { prisma, warmupDb } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { existingFriendship, acceptFriendship, shareOwnAppsToUser } from "@/lib/sharing";
import { ensureBotUser } from "@/lib/bot";
import { CHANNEL_USERNAMES } from "@/lib/channelsMeta";
import { enforceRateLimit } from "@/lib/rateLimit";
import { parseBody, friendSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

// GET /api/friends — accepted friends + pending requests
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();
  const me = session.userId;

  await warmupDb();
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

  const limited = await enforceRateLimit(req, "friend-req", 30, 60, session.userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = parseBody(friendSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const toUsername = parsed.data.toUsername;

  await warmupDb();

  // Subscribing to a channel feed: it auto-accepts + backfills. A channel is
  // either a built-in feed bot or a user who registered as a channel.
  const isStaticBot = CHANNEL_USERNAMES.has(toUsername);
  if (isStaticBot) await ensureBotUser(toUsername);

  const other = await prisma.user.findUnique({
    where: { username: toUsername },
    select: { id: true, username: true, isChannel: true },
  });
  if (!other) return NextResponse.json({ error: "No user with that username." }, { status: 404 });
  if (other.id === session.userId)
    return NextResponse.json({ error: "You can't friend yourself." }, { status: 400 });

  const isChannel = isStaticBot || other.isChannel;
  if (isChannel) {
    const prior = await existingFriendship(session.userId, other.id);
    if (prior?.status === "accepted")
      return NextResponse.json({ error: "You're already subscribed." }, { status: 409 });
    if (prior) {
      await prisma.friendship.update({ where: { id: prior.id }, data: { status: "accepted" } });
    } else {
      await prisma.friendship.create({
        data: { requesterId: session.userId, addresseeId: other.id, status: "accepted" },
      });
    }
    await shareOwnAppsToUser(other.id, other.username, session.userId);
    return NextResponse.json({ ok: true, becameFriends: true });
  }

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

  try {
    await prisma.friendship.create({
      data: { requesterId: session.userId, addresseeId: other.id },
    });
  } catch {
    // Concurrent duplicate request — unique constraint tripped.
    return NextResponse.json({ error: "Request already sent." }, { status: 409 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
