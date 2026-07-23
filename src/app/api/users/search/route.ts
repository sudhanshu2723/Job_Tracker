import { NextResponse } from "next/server";
import { prisma, warmupDb } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { CHANNEL_USERNAMES } from "@/lib/channelsMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_CHARS = 2;
const LIMIT = 10;

type Relationship = "friends" | "outgoing" | "incoming" | "none";

// GET /api/users/search?q=... — Instagram-style people search for friend requests.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limited = await enforceRateLimit(req, "user-search", 40, 60, session.userId);
  if (limited) return limited;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < MIN_CHARS) return NextResponse.json({ users: [] });

  await warmupDb();
  const matches = await prisma.user.findMany({
    where: {
      username: { contains: q, mode: "insensitive" },
      id: { not: session.userId },
      isChannel: false, // channels are subscribed via /channels, not friended
    },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
    take: LIMIT + CHANNEL_USERNAMES.size, // over-fetch, then drop bots
  });

  const people = matches.filter((u) => !CHANNEL_USERNAMES.has(u.username)).slice(0, LIMIT);
  if (people.length === 0) return NextResponse.json({ users: [] });

  // Resolve each match's relationship to the current user in one query.
  const ids = people.map((p) => p.id);
  const links = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: session.userId, addresseeId: { in: ids } },
        { addresseeId: session.userId, requesterId: { in: ids } },
      ],
    },
    select: { id: true, status: true, requesterId: true, addresseeId: true },
  });

  const relOf = (otherId: string): { relationship: Relationship; friendshipId: string | null } => {
    const f = links.find((l) => l.requesterId === otherId || l.addresseeId === otherId);
    if (!f) return { relationship: "none", friendshipId: null };
    if (f.status === "accepted") return { relationship: "friends", friendshipId: f.id };
    return {
      relationship: f.requesterId === session.userId ? "outgoing" : "incoming",
      friendshipId: f.id,
    };
  };

  const users = people.map((p) => ({ username: p.username, ...relOf(p.id) }));
  return NextResponse.json({ users });
}
