import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jobspy-js (Glassdoor scraper) pulls in a WASM asset (wreq-js) that can't be
  // bundled. It's only used by the local scan runner, never on Vercel, so keep
  // it external and load it lazily from the source that uses it.
  serverExternalPackages: ["jobspy-js"],
};

export default nextConfig;
