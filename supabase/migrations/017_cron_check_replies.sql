-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule check-replies every 5 minutes
SELECT cron.schedule(
  'check-replies',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/check-replies',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Schedule process-queue every 2 minutes
SELECT cron.schedule(
  'process-queue',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/process-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
