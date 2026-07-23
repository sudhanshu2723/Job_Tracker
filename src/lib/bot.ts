import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/** Default channel bot (kept for backwards-compatible callers). */
export const BOT_USERNAME = "career_ops";

/**
 * Ensure a channel bot account exists. Bots have a random password (no one logs
 * in as them) — users interact with them only by "friending" (subscribing).
 */
export async function ensureBotUser(
  username: string = BOT_USERNAME,
): Promise<{ id: string; username: string }> {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (existing) return existing;

  const randomPassword = `${Math.random()}-${Date.now()}-bot`;
  return prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(randomPassword, 10) },
    select: { id: true, username: true },
  });
}
