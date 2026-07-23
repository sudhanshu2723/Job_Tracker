import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge guard for the API surface. Auth/authorization still live in each route
// (proxy is defence-in-depth, not the only gate).
//
// Blocks state-changing API calls that don't originate from our own site — so a
// third-party page can't ride a logged-in user's cookie (CSRF), and scripts
// can't hit mutating endpoints without a matching Origin. Layers on top of the
// SameSite=Lax session cookie.

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cron is authenticated by a bearer secret and called server-to-server
  // (GitHub Actions / Vercel Cron) with no browser Origin — skip the check.
  if (pathname.startsWith("/api/cron")) return NextResponse.next();

  if (UNSAFE.has(request.method)) {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    // Browsers always send Origin on POST/PUT/PATCH/DELETE. A missing or
    // cross-origin value on a mutating API call is rejected.
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && !!host && new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return NextResponse.json(
        { error: "Cross-origin request blocked." },
        { status: 403 },
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
