import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { shareOwnAppsToUser } from "@/lib/sharing";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/invites/:id/accept — recipient accepts; sender receives their postings
export async function POST(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const invite = await prisma.invitation.findUnique({ where: { id } });
  if (!invite || invite.toUserId !== session.userId)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (invite.status !== "pending")
    return NextResponse.json({ error: "Already handled." }, { status: 409 });

  // Claim the invite atomically first — a concurrent double-accept flips 0 rows.
  const flipped = await prisma.invitation.updateMany({
    where: { id, status: "pending" },
    data: { status: "accepted" },
  });
  if (flipped.count === 0)
    return NextResponse.json({ error: "Already handled." }, { status: 409 });

  // Copy MY (the accepter's) postings in the date window to the inviter.
  const copied = await shareOwnAppsToUser(
    session.userId,
    session.username,
    invite.fromUserId,
    { fromDate: invite.fromDate, toDate: invite.toDate },
  );

  return NextResponse.json({ ok: true, copied });
}
