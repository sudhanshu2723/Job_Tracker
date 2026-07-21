import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/invites/:id/decline — recipient declines
export async function POST(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const invite = await prisma.invitation.findUnique({ where: { id } });
  if (!invite || invite.toUserId !== session.userId)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  await prisma.invitation.update({ where: { id }, data: { status: "declined" } });
  return NextResponse.json({ ok: true });
}
