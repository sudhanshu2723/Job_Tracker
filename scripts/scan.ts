// Scan one (or more) channels directly against Neon — no dev server needed.
// Used by the GitHub Actions matrix (one job per channel) and runnable locally:
//   node --env-file=.env --import tsx scripts/scan.ts --only=career_ops
//   node --env-file=.env --import tsx scripts/scan.ts            (all channels)
// Comma-separate for several: --only=remotive,jobicy  (or env SCAN_ONLY=...)
export {}; // isolate module scope (scripts/run-scan.ts also defines `main`)

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  const raw = arg ? arg.slice("--only=".length) : process.env.SCAN_ONLY || "";
  const only = raw.split(",").map((s) => s.trim()).filter(Boolean);

  // portals.ts reads ENABLE_JOBSPY at module load, so honour --ats-only first.
  if (process.argv.includes("--ats-only")) process.env.ENABLE_JOBSPY = "false";

  const { runChannels } = await import("../src/lib/dailyScan");
  const stamp = new Date().toISOString();
  try {
    const summary = await runChannels(only.length ? { only } : undefined);
    const added = summary.reduce((n, s) => n + s.added, 0);
    console.log(`${stamp} scan OK (+${added} new) ${JSON.stringify(summary)}`);
    process.exit(0);
  } catch (err) {
    console.error(`${stamp} scan FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
