import { PrismaClient } from "@prisma/client";

// Reuse a single client across hot-reloads in dev to avoid exhausting connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Neon's serverless compute suspends when idle; the first query after that can
 * fail with P1001 while it wakes. Retry a trivial ping until it's reachable so
 * cold starts don't surface as errors.
 */
export async function warmupDb(attempts = 6, delayMs = 2500): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
