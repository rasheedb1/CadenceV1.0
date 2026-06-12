-- Migration 110: Google OAuth token keepalive cron
-- Plan: tasks/plan-paula-sf-pipeline-watcher.md (token-doesnt-expire requirement)
-- Mirrors migration 109 (sf_token_keepalive) for Google OAuth.
-- Cron runs daily at 04:30 UTC (30 min after SF keepalive).

SELECT cron.schedule(
  'google_token_keepalive',
  '30 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/google-keepalive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- On-demand trigger: SELECT google_keepalive_now();
CREATE OR REPLACE FUNCTION public.google_keepalive_now(p_org_id uuid DEFAULT NULL)
RETURNS bigint AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/google-keepalive',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := CASE
      WHEN p_org_id IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('org_id', p_org_id)
    END
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql;
