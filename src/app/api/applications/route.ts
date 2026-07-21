import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { APP_SELECT, sanitizeDraft } from "@/lib/appShape";
import { fanoutToFriends } from "@/lib/sharing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });

// GET /api/applications — list the current user's applications
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const apps = await prisma.application.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: APP_SELECT,
  });
  return NextResponse.json(apps);
}

// POST /api/applications — create one for the current user
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const draft = sanitizeDraft(body);
  if (!draft.company.trim() || !draft.role.trim()) {
    return NextResponse.json(
      { error: "Company and role are required." },
      { status: 400 },
    );
  }
  const created = await prisma.application.create({
    data: { ...draft, userId: session.userId },
    select: APP_SELECT,
  });
  // Continuous sync: push a Wishlist copy to every accepted friend.
  await fanoutToFriends(session.userId, session.username, created);
  return NextResponse.json(created, { status: 201 });
}

// PUT /api/applications — replace the current user's list (Import)
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an array." }, { status: 400 });
  }
  const rows = body
    .map((item) => ({ ...sanitizeDraft(item), userId: session.userId }))
    .filter((r) => r.company.trim() && r.role.trim());

  await prisma.$transaction([
    prisma.application.deleteMany({ where: { userId: session.userId } }),
    ...rows.map((data) => prisma.application.create({ data })),
  ]);

  const all = await prisma.application.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    select: APP_SELECT,
  });
  return NextResponse.json(all);
}

// DELETE /api/applications — clear the current user's list
export async function DELETE() {
  const session = await getSession();
  if (!session) return unauthorized();

  await prisma.application.deleteMany({ where: { userId: session.userId } });
  return NextResponse.json({ ok: true });
}
