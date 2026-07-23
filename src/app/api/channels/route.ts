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

  // User-created channels (publisher accounts), plus the built-in feed bots.
  const userChannels = await prisma.user.findMany({
    where: { isChannel: true, id: { not: me } },
    select: { id: true, username: true, channelLabel: true, channelDescription: true },
  });
  const metaByName = new Map<string, { username: string; label: string; description: string }>();
  for (const c of CHANNEL_META) metaByName.set(c.username, c);
  for (const u of userChannels) {
    if (metaByName.has(u.username)) continue; // built-in wins on name clash
    metaByName.set(u.username, {
      username: u.username,
      label: u.channelLabel?.trim() || u.username,
      description: u.channelDescription?.trim() || "A member-run job feed.",
    });
  }
  const channelMeta = [...metaByName.values()];

  const usernames = channelMeta.map((c) => c.username);
  const bots = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true, username: true },
  });
  const botByName = new Map(bots.map((b) => [b.username, b]));
  const botIds = bots.map((b) => b.id);

  const [totals, friendships, mine, subscribers] = await Promise.all([
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
    // Global subscriber count per bot (a subscribe always makes the bot the addressee).
    prisma.friendship.groupBy({
      by: ["addresseeId"],
      where: { status: "accepted", addresseeId: { in: botIds } },
      _count: { _all: true },
    }),
  ]);

  const totalByUser = new Map(totals.map((t) => [t.userId, t._count._all]));
  const mineByChannel = new Map(mine.map((m) => [m.sharedFrom, m._count._all]));
  const subsByBot = new Map(subscribers.map((s) => [s.addresseeId, s._count._all]));
  const botIdSet = new Set(botIds);
  const frByBot = new Map<string, string>();
  for (const f of friendships) {
    const botId = botIdSet.has(f.requesterId) ? f.requesterId : f.addresseeId;
    frByBot.set(botId, f.id);
  }

  const channels = channelMeta.map((ch) => {
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
      subscribers: bot ? subsByBot.get(bot.id) ?? 0 : 0,
    };
  });

  return NextResponse.json({ channels });
}
