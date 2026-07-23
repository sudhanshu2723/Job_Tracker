@echo off
REM Scheduled every-6-hours FULL scan, including LinkedIn/Indeed (JobSpy).
REM (No --ats-only, so ENABLE_JOBSPY from .env applies.) The 2-hourly ATS task
REM handles frequent board refreshes; this slower task adds LinkedIn/Indeed.
cd /d D:\job-tracker
node --env-file=.env --import tsx scripts\run-scan.ts >> D:\job-tracker\scan-cron.log 2>&1
