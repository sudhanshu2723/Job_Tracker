import { NextResponse } from "next/server";
import { runAllChannels } from "@/lib/dailyScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const channels = await runAllChannels();
    return NextResponse.json({ ok: true, channels });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers GET; POST is available for manual runs.
export const GET = handle;
export const POST = handle;
