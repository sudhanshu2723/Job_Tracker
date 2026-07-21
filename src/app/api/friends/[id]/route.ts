import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/friends/:id — unfriend, cancel a sent request, or decline one.
// (Existing synced postings stay; only future sync stops.)
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const fr = await prisma.friendship.findUnique({ where: { id } });
  if (
    !fr ||
    (fr.requesterId !== session.userId && fr.addresseeId !== session.userId)
  ) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
