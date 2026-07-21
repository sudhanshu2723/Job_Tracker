// Triggers the daily portal scan by calling the protected cron endpoint.
// For local/self-hosted scheduling (Windows Task Scheduler, cron, etc.).
//
// Run:  node --env-file=.env scripts/daily-scan.mjs
// (needs the app server running, and CRON_SECRET set in .env)

const base = process.env.APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is not set. Add it to .env.");
  process.exit(1);
}

const res = await fetch(`${base}/api/cron/scan`, {
  headers: { authorization: `Bearer ${secret}` },
});

console.log(`HTTP ${res.status}`);
console.log(await res.text());
if (!res.ok) process.exit(1);
