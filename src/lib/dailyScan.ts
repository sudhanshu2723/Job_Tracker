import { prisma, warmupDb } from "./prisma";
import { ensureBotUser } from "./bot";
import { fanoutManyToFriends } from "./sharing";
import { deriveCountry } from "./countries";
import { CHANNELS, type Channel } from "./channels";

export interface ChannelScanSummary {
  channel: string;
  scanned: number;
  matches: number;
  added: number;
  syncedCopies: number;
  errors: number;
}

/**
 * Scan one channel's source, add brand-new postings to that channel's bot
 * account, and fan them out to everyone subscribed (friended) to the bot.
 */
export async function runChannelScan(channel: Channel): Promise<ChannelScanSummary> {
  await warmupDb(); // wake Neon if it has suspended
  const bot = await ensureBotUser(channel.username);
  const result = await channel.scan();

  const existing = await prisma.application.findMany({
    where: { userId: bot.id },
    select: { link: true },
  });
  const known = new Set(existing.map((e) => e.link).filter(Boolean));
  const fresh = result.jobs.filter((j) => j.link && !known.has(j.link));

  const base = {
    channel: channel.username,
    scanned: result.scannedCompanies,
    matches: result.jobs.length,
    errors: result.errors.length,
  };
  if (fresh.length === 0) return { ...base, added: 0, syncedCopies: 0 };

  await prisma.application.createMany({
    data: fresh.map((j) => ({
      userId: bot.id,
      company: j.company,
      role: j.role,
      link: j.link,
      location: j.location,
      country: deriveCountry(j.location),
      status: "wishlist",
      source: channel.username,
    })),
    skipDuplicates: true,
  });

  const added = await prisma.application.findMany({
    where: { userId: bot.id, link: { in: fresh.map((j) => j.link) } },
    select: { id: true, company: true, role: true, link: true, location: true, country: true },
  });

  const syncedCopies = await fanoutManyToFriends(bot.id, bot.username, added);
  return { ...base, added: added.length, syncedCopies };
}

/** Scan every registered channel. */
export async function runAllChannels(): Promise<ChannelScanSummary[]> {
  const summaries: ChannelScanSummary[] = [];
  for (const channel of CHANNELS) {
    try {
      summaries.push(await runChannelScan(channel));
    } catch (err) {
      summaries.push({
        channel: channel.username,
        scanned: 0,
        matches: 0,
        added: 0,
        syncedCopies: 0,
        errors: 1,
      });
      console.error(`channel ${channel.username} failed:`, err);
    }
  }
  return summaries;
}
