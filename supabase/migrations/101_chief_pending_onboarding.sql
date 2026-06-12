-- chief_pending_onboarding: tracks the multi-message onboarding state for a
-- WhatsApp number that doesn't yet have a row in chief_sessions.
--
-- Flow:
--   1. Unknown number sends first message → bridge inserts pending row with
--      step='await_email' and asks "¿Cuál es tu email de Yuno?".
--   2. Number replies → bridge looks up auth.users by email, finds org_id via
--      organization_members, inserts chief_sessions, deletes pending row,
--      and confirms with the user.
--   3. If the email isn't registered, attempts is incremented; after 3 strikes
--      the row is deleted and the user is told to contact an admin.
--
-- Rows expire after 30 minutes of inactivity (cleaned up by pg_cron or lazy on
-- next message — both are safe).

CREATE TABLE IF NOT EXISTS public.chief_pending_onboarding (
  whatsapp_number text PRIMARY KEY,
  step            text        NOT NULL DEFAULT 'await_email'
    CHECK (step IN ('await_email')),
  attempts        int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);

CREATE INDEX IF NOT EXISTS chief_pending_onboarding_expires_at_idx
  ON public.chief_pending_onboarding(expires_at);

ALTER TABLE public.chief_pending_onboarding ENABLE ROW LEVEL SECURITY;

-- Service role only. The bridge uses service role to read/write this; no user
-- policy is needed because end users never touch it directly.
DROP POLICY IF EXISTS "service_role_all" ON public.chief_pending_onboarding;
CREATE POLICY "service_role_all" ON public.chief_pending_onboarding
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
