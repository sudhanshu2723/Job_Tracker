// Runs the career_ops job scan directly against Neon (no dev server needed).
// Invoked by the scheduled task via tsx. Run manually with:
//   node --env-file=.env --import tsx scripts/run-scan.ts            (ATS + LinkedIn/Indeed)
//   node --env-file=.env --import tsx scripts/run-scan.ts --ats-only (ATS boards only)

export {}; // isolate module scope (scripts/scan.ts also defines `main`)

async function main() {
  // Force ATS-only BEFORE importing (portals reads ENABLE_JOBSPY at module load).
  if (process.argv.includes("--ats-only")) process.env.ENABLE_JOBSPY = "false";

  const { runAllChannels } = await import("../src/lib/dailyScan");
  const stamp = new Date().toISOString();
  try {
    const summary = await runAllChannels();
    console.log(`${stamp} scan OK ${JSON.stringify(summary)}`);
    process.exit(0);
  } catch (err) {
    console.error(`${stamp} scan FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
