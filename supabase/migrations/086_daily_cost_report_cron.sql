-- =====================================================
-- 086: Daily Cost Report Cron
-- Runs hourly. The edge function self-checks each user's
-- timezone and only sends at their local 8am (1 hour before standup).
-- =====================================================

-- Unschedule if exists (idempotent)
SELECT cron.unschedule('daily-cost-report') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-cost-report'
);

-- Schedule: every hour, function self-filters by timezone
SELECT cron.schedule(
  'daily-cost-report',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/daily-cost-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxMTY4MywiZXhwIjoyMDg1Mzg3NjgzfQ.OxSVhkALrwbxmgtUvXLlONP_TI51RXCm5reMhARC4oQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
