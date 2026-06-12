-- Migration 109: Salesforce token keepalive cron
-- Plan: tasks/plan-paula-sf-pipeline-watcher.md
-- Purpose: keep SF refresh tokens alive by exercising them daily.
--          Detects expiry/revocation early; alerts via WhatsApp.
--          Edge fn `salesforce-keepalive` does the actual refresh.

-- Schedule the edge function to run daily at 04:00 UTC = 22:00 MX
-- (off-hours, 5h before Paula's Mon+Fri 09:00 MX runs)
SELECT cron.schedule(
  'sf_token_keepalive',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/salesforce-keepalive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Service role key is read via current_setting('app.service_role_key').
-- Set this once at the database level so the cron has it available without
-- hardcoding it in the migration:
--
--   ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
--
-- (Run manually via Supabase dashboard SQL editor — NOT in migration to keep
-- secret out of git history.)

-- Convenience: function to trigger keepalive on demand (e.g. right after a
-- user reconnects, to verify the new token works immediately).
CREATE OR REPLACE FUNCTION public.sf_keepalive_now(p_org_id uuid DEFAULT NULL)
RETURNS bigint AS $$
DECLARE
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://arupeqczrxmfkcbjwyad.supabase.co/functions/v1/salesforce-keepalive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := CASE
      WHEN p_org_id IS NULL THEN '{}'::jsonb
      ELSE jsonb_build_object('org_id', p_org_id)
    END
  ) INTO v_request_id;
  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql;
