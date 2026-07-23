import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { APP_SELECT, sanitizeDraft } from "@/lib/appShape";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const unauthorized = () =>
  NextResponse.json({ error: "Not authenticated" }, { status: 401 });
const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });

// PUT /api/applications/:id — update one you own
export async function PUT(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();

  const limited = await enforceRateLimit(req, "app-update", 120, 60, session.userId);
  if (limited) return limited;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const draft = sanitizeDraft(body);
  if (!draft.company.trim() || !draft.role.trim()) {
    return NextResponse.json(
      { error: "Company and role are required." },
      { status: 400 },
    );
  }

  const owned = await prisma.application.findFirst({
    where: { id, userId: session.userId },
    select: { id: true },
  });
  if (!owned) return notFound();

  const updated = await prisma.application.update({
    where: { id },
    data: draft,
    select: APP_SELECT,
  });
  return NextResponse.json(updated);
}

// DELETE /api/applications/:id — delete one you own
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const result = await prisma.application.deleteMany({
    where: { id, userId: session.userId },
  });
  if (result.count === 0) return notFound();
  return NextResponse.json({ ok: true });
}
