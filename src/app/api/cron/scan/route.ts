import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runChannels } from "@/lib/dailyScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Hobby caps function duration at 60s. (?only=/?except= still let you
// scan a single channel manually or via a future per-bot cron.)
export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

function csv(v: string | null): string[] | undefined {
  if (!v) return undefined;
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // ?only=career_ops (one bot per cron) or ?except=career_ops; omit to scan all.
  const params = new URL(req.url).searchParams;
  const only = csv(params.get("only"));
  const except = csv(params.get("except"));
  try {
    const channels = await runChannels({ only, except });
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
