-- =====================================================
-- 080: Daily Standup Cron — 9:00 AM Mexico City time
-- Calls the daily-standup edge function every weekday
-- =====================================================

-- Unschedule if exists (idempotent)
SELECT cron.unschedule('daily-standup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-standup'
);

-- Schedule: Monday-Friday at 9:00 AM Mexico City (UTC-6 = 15:00 UTC)
SELECT cron.schedule(
  'daily-standup',
  '0 15 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/daily-standup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxMTY4MywiZXhwIjoyMDg1Mzg3NjgzfQ.OxSVhkALrwbxmgtUvXLlONP_TI51RXCm5reMhARC4oQ"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
