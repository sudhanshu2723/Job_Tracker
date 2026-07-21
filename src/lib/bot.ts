import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/** The system account that owns scanned jobs and syncs them to its friends. */
export const BOT_USERNAME = "career_ops";

/**
 * Ensure the career_ops bot account exists. It has a random password (no one
 * logs in as it) — users interact with it only by "friending" it.
 */
export async function ensureBotUser(): Promise<{ id: string; username: string }> {
  const existing = await prisma.user.findUnique({
    where: { username: BOT_USERNAME },
    select: { id: true, username: true },
  });
  if (existing) return existing;

  const randomPassword = `${Math.random()}-${Date.now()}-bot`;
  return prisma.user.create({
    data: { username: BOT_USERNAME, passwordHash: await bcrypt.hash(randomPassword, 10) },
    select: { id: true, username: true },
  });
}
