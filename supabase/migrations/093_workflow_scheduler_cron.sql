-- Migration 093: pg_cron job for processing agent workflows every 5 minutes
-- This triggers process-workflow which:
-- 1. Creates runs for scheduled workflows whose cron matches
-- 2. Processes active/waiting runs (executes nodes, advances graph)

SELECT cron.schedule(
  'process-agent-workflows',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/process-workflow',
    headers := '{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFydXBlcWN6cnhtZmtjYmp3eWFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxMTY4MywiZXhwIjoyMDg1Mzg3NjgzfQ.OxSVhkALrwbxmgtUvXLlONP_TI51RXCm5reMhARC4oQ", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
