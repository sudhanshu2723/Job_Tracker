import type { NextConfig } from "next";

// Security headers applied to every response.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline' needed for the theme bootstrap script + Next's inline runtime;
      // 'unsafe-eval' for dev/HMR. React escaping is the primary XSS defense.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      // Allow blob: frames so the tailored-résumé PDF preview (a locally-created
      // blob URL, never external) can render in an <iframe>.
      "frame-src 'self' blob:",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Don't advertise the framework.
  poweredByHeader: false,
  // jobspy-js (Glassdoor scraper) pulls in a WASM asset (wreq-js) that can't be
  // bundled. It's only used by the local scan runner, never on Vercel, so keep
  // it external and load it lazily from the source that uses it.
  serverExternalPackages: ["jobspy-js", "pdfjs-dist"],
  // The résumé tailor reads the bundled Charter (XCharter) OTFs at runtime via
  // fs; make sure they're traced into the serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/resume/tailor": ["./src/lib/fonts/*.otf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
