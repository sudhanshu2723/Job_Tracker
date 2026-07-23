@echo off
REM Wrapper for the scheduled every-2-hours career_ops scan (ATS boards only).
REM Remove --ats-only to also scrape LinkedIn/Indeed (not recommended at 2h cadence).
cd /d D:\job-tracker
node --env-file=.env --import tsx scripts\run-scan.ts --ats-only >> D:\job-tracker\scan-cron.log 2>&1
