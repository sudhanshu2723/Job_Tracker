import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { acceptFriendship } from "@/lib/sharing";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/friends/:id/accept — addressee accepts a friend request
export async function POST(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const fr = await prisma.friendship.findUnique({ where: { id } });
  if (!fr || fr.addresseeId !== session.userId)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (fr.status !== "pending")
    return NextResponse.json({ error: "Already handled." }, { status: 409 });

  await acceptFriendship(fr.id, fr.requesterId, fr.addresseeId);
  return NextResponse.json({ ok: true });
}
