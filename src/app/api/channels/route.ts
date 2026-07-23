import { NextResponse } from "next/server";
import { prisma, warmupDb } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { CHANNEL_META } from "@/lib/channelsMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/channels — per-channel stats for the current user.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const me = session.userId;

  await warmupDb();
  const usernames = CHANNEL_META.map((c) => c.username);
  const bots = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  });
  const botByName = new Map(bots.map((b) => [b.username, b]));
  const botIds = bots.map((b) => b.id);

  const [totals, friendships, mine] = await Promise.all([
    prisma.application.groupBy({
      by: ["userId"],
      where: { userId: { in: botIds } },
      _count: { _all: true },
    }),
    prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [
          { requesterId: me, addresseeId: { in: botIds } },
          { addresseeId: me, requesterId: { in: botIds } },
        ],
      },
      select: { id: true, requesterId: true, addresseeId: true },
    }),
    prisma.application.groupBy({
      by: ["sharedFrom"],
      where: { userId: me, sharedFrom: { in: usernames } },
      _count: { _all: true },
    }),
  ]);

  const totalByUser = new Map(totals.map((t) => [t.userId, t._count._all]));
  const mineByChannel = new Map(mine.map((m) => [m.sharedFrom, m._count._all]));
  const botIdSet = new Set(botIds);
  const frByBot = new Map<string, string>();
  for (const f of friendships) {
    const botId = botIdSet.has(f.requesterId) ? f.requesterId : f.addresseeId;
    frByBot.set(botId, f.id);
  }

  const channels = CHANNEL_META.map((ch) => {
    const bot = botByName.get(ch.username);
    const friendshipId = bot ? frByBot.get(bot.id) ?? null : null;
    return {
      username: ch.username,
      label: ch.label,
      description: ch.description,
      totalJobs: bot ? totalByUser.get(bot.id) ?? 0 : 0,
      subscribed: !!friendshipId,
      friendshipId,
      myCount: mineByChannel.get(ch.username) ?? 0,
    };
  });

  return NextResponse.json({ channels });
}
