// One-time backfill: derive country from location for existing rows.
// Batched for speed. Run: node scripts/backfill-country.mjs
import { PrismaClient } from "@prisma/client";
const { deriveCountry } = await import("../src/lib/countries.ts");

const prisma = new PrismaClient();
const rows = await prisma.application.findMany({
  where: { country: "" },
  select: { id: true, location: true },
});

const updates = rows
  .map((r) => ({ id: r.id, country: deriveCountry(r.location || "") }))
  .filter((u) => u.country);

const CHUNK = 25;
let done = 0;
for (let i = 0; i < updates.length; i += CHUNK) {
  const batch = updates.slice(i, i + CHUNK);
  await Promise.all(
    batch.map((u) =>
      prisma.application.update({ where: { id: u.id }, data: { country: u.country } }),
    ),
  );
  done += batch.length;
}
console.log(`backfilled ${done} of ${rows.length} empty rows`);
await prisma.$disconnect();
