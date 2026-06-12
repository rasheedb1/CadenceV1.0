-- ============================================================================
-- S3 — Agent Web Chat schema (DRAFT — not numbered, do NOT apply directly)
-- ============================================================================
-- Tables: agent_web_threads, agent_chat_events (RANGE-partitioned by month),
--         agent_idempotency_keys, agent_audit_log
-- Plus:   agents.max_cost_per_turn_usd column, organizations.agent_web_chat_enabled flag,
--         pg_cron jobs for partition rolling and idempotency TTL.
--
-- Design notes
-- ------------
--   * Partitioning uses native Postgres declarative RANGE partitions + a
--     pg_cron job that maintains a rolling window. We do NOT depend on
--     pg_partman because it is not a confirmed Supabase-managed extension.
--     The cron approach works on every Supabase tier; if pg_partman is later
--     enabled we can swap mechanics without changing the table shape.
--
--   * IDs use gen_random_uuid() (uuid v4) — Postgres 14/15 (Supabase managed)
--     does NOT ship a v7 generator natively. We accept v4 because the hot
--     query is `where thread_id = ? order by id desc` and id is only ever
--     locally ordered within a thread; we add a `created_at` companion that
--     IS ordered globally. If we later need uuid v7 we can introduce a
--     plpgsql generator and rotate ids on writes only — partitions remain
--     keyed on created_at, so the change is isolated.
--
--   * RLS uses indexed equality on denormalized (org_id, user_id) columns
--     and the (select auth.uid()) trick so Postgres caches the JWT lookup
--     once per statement instead of once per row.
--
--   * Service role bypasses RLS by Supabase default — bridge inserts run as
--     service role and use explicit org/user filters in code, NOT RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions (idempotent, all confirmed available on Supabase)
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_cron;                          -- partition rolling + TTL
-- Note: pg_partman intentionally NOT used. See header.

-- ----------------------------------------------------------------------------
-- 2. agents.max_cost_per_turn_usd
-- ----------------------------------------------------------------------------
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS max_cost_per_turn_usd numeric(10,4) NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN public.agents.max_cost_per_turn_usd IS
  'Hard cost ceiling per turn (USD). Bridge aborts the turn if exceeded mid-stream.';

-- ----------------------------------------------------------------------------
-- 3. organizations.agent_web_chat_enabled feature flag
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS agent_web_chat_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.agent_web_chat_enabled IS
  'Feature flag — if false, /chat returns 404 for this org.';

-- ----------------------------------------------------------------------------
-- 4. agent_web_threads — one row per chat thread (browser tab session)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_web_threads (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id               uuid        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  agent_id              uuid        NOT NULL REFERENCES public.agents(id)      ON DELETE CASCADE,
  title                 text,
  sdk_session_id        text,                                  -- Claude Agent SDK resume token
  status                text        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','paused','archived')),
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  total_input_tokens    bigint      NOT NULL DEFAULT 0,
  total_output_tokens   bigint      NOT NULL DEFAULT 0,
  total_cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_web_threads IS 'Chat threads. org_id is set on creation and immutable.';
COMMENT ON COLUMN public.agent_web_threads.org_id IS
  'Pinned at creation. Bridge MUST compare against current JWT org on every POST /messages and 409 on mismatch.';

-- Hot indexes
CREATE INDEX IF NOT EXISTS idx_agent_web_threads_user_recent
  ON public.agent_web_threads (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_web_threads_org_user
  ON public.agent_web_threads (org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agent_web_threads_agent
  ON public.agent_web_threads (agent_id, status);

-- Immutability of org_id (defense in depth — UI should never offer it)
CREATE OR REPLACE FUNCTION public.tg_agent_web_threads_lock_org_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
    RAISE EXCEPTION 'agent_web_threads.org_id is immutable (was %, attempted %)',
      OLD.org_id, NEW.org_id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_org_id ON public.agent_web_threads;
CREATE TRIGGER lock_org_id
  BEFORE UPDATE ON public.agent_web_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_agent_web_threads_lock_org_id();

ALTER TABLE public.agent_web_threads ENABLE ROW LEVEL SECURITY;

-- Indexed RLS — equality only, no joins, no per-row subqueries
CREATE POLICY "agent_web_threads_select_own"
  ON public.agent_web_threads FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "agent_web_threads_insert_own"
  ON public.agent_web_threads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (select auth.uid())
        AND om.org_id  = agent_web_threads.org_id
    )
  );

CREATE POLICY "agent_web_threads_update_own"
  ON public.agent_web_threads FOR UPDATE TO authenticated
  USING      (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "agent_web_threads_service_all"
  ON public.agent_web_threads FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 5. agent_chat_events — RANGE-partitioned event log (high write rate)
-- ----------------------------------------------------------------------------
-- Composite PRIMARY KEY (created_at, id) is required because Postgres
-- partition keys MUST appear in the PK. created_at is leftmost so range
-- pruning works; id keeps each row globally addressable.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_chat_events (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL,
  turn_id     uuid        NOT NULL,
  org_id      uuid        NOT NULL,                            -- denormalized for indexed RLS
  user_id     uuid        NOT NULL,                            -- denormalized for indexed RLS
  event_type  text        NOT NULL,                            -- 'user_message','assistant_chunk','tool_call','tool_result','turn_started','turn_completed','turn_aborted','turn_paused','error'
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE public.agent_chat_events IS
  'Append-only chat event log. Partitioned by month. PII regex-scrubbed by bridge BEFORE insert.';
COMMENT ON COLUMN public.agent_chat_events.org_id IS
  'Denormalized from agent_web_threads. Allows indexed-equality RLS without joins.';

-- Indexes propagate to all partitions (Postgres 11+ semantics).
-- thread-recent hot query: where thread_id = ? order by created_at desc, id desc limit 100
CREATE INDEX IF NOT EXISTS idx_agent_chat_events_thread_recent
  ON public.agent_chat_events (thread_id, created_at DESC, id DESC);

-- RLS predicate: equality on (org_id, user_id) — covering the JWT lookup
CREATE INDEX IF NOT EXISTS idx_agent_chat_events_rls
  ON public.agent_chat_events (org_id, user_id, thread_id);

-- Turn lookup (for cancel + audit)
CREATE INDEX IF NOT EXISTS idx_agent_chat_events_turn
  ON public.agent_chat_events (turn_id);

ALTER TABLE public.agent_chat_events ENABLE ROW LEVEL SECURITY;

-- RLS: equality-only, indexed, no subqueries against organization_members
-- (the bridge sets org_id/user_id at insert time; this is safe because the
-- bridge always uses service role for writes and the trusted org_id pin).
CREATE POLICY "agent_chat_events_select_own"
  ON public.agent_chat_events FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "agent_chat_events_service_all"
  ON public.agent_chat_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---- Initial partitions (current month + next 2) ----------------------------
-- The function below is idempotent so re-running is safe.
CREATE OR REPLACE FUNCTION public.ensure_agent_chat_events_partition(p_month_start date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_part_name text := format('agent_chat_events_y%sm%s',
                             to_char(p_month_start, 'YYYY'),
                             to_char(p_month_start, 'MM'));
  v_next      date := (p_month_start + interval '1 month')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_chat_events
       FOR VALUES FROM (%L) TO (%L)',
    v_part_name, p_month_start, v_next);
END;
$$;

-- Bootstrap current + 2 future months
SELECT public.ensure_agent_chat_events_partition(date_trunc('month', now())::date);
SELECT public.ensure_agent_chat_events_partition((date_trunc('month', now()) + interval '1 month')::date);
SELECT public.ensure_agent_chat_events_partition((date_trunc('month', now()) + interval '2 month')::date);

-- ----------------------------------------------------------------------------
-- 6. Partition rolling — pg_cron job
-- ----------------------------------------------------------------------------
-- Daily at 03:00 UTC: ensure +2 months exist; detach+drop partitions older
-- than 90 days (matches retention policy in plan §10).
CREATE OR REPLACE FUNCTION public.roll_agent_chat_events_partitions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_target date;
  v_old    record;
  v_cutoff date := (date_trunc('month', now()) - interval '3 month')::date;  -- 90d retention
BEGIN
  -- (a) Ensure the next 2 months always exist
  v_target := date_trunc('month', now())::date;
  PERFORM public.ensure_agent_chat_events_partition(v_target);
  v_target := (date_trunc('month', now()) + interval '1 month')::date;
  PERFORM public.ensure_agent_chat_events_partition(v_target);
  v_target := (date_trunc('month', now()) + interval '2 month')::date;
  PERFORM public.ensure_agent_chat_events_partition(v_target);

  -- (b) Detach + drop partitions whose UPPER bound is <= cutoff
  FOR v_old IN
    SELECT child.relname AS partition_name,
           pg_get_expr(child.relpartbound, child.oid) AS bounds
    FROM   pg_inherits i
    JOIN   pg_class parent ON parent.oid = i.inhparent
    JOIN   pg_class child  ON child.oid  = i.inhrelid
    WHERE  parent.relname = 'agent_chat_events'
  LOOP
    -- bounds looks like:  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01')
    -- Drop the partition only if its TO < cutoff.
    IF substring(v_old.bounds FROM 'TO \(''([0-9-]+)''\)')::date <= v_cutoff THEN
      EXECUTE format('ALTER TABLE public.agent_chat_events DETACH PARTITION public.%I',
                     v_old.partition_name);
      EXECUTE format('DROP TABLE public.%I', v_old.partition_name);
      RAISE NOTICE 'Dropped partition %', v_old.partition_name;
    END IF;
  END LOOP;
END;
$$;

-- Schedule (idempotent — unschedule first if exists)
DO $$
DECLARE v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'agent_chat_events_roll';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'agent_chat_events_roll',
  '0 3 * * *',
  $$ SELECT public.roll_agent_chat_events_partitions(); $$
);

-- ----------------------------------------------------------------------------
-- 7. agent_idempotency_keys — POST /messages dedupe (24h TTL)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_idempotency_keys (
  key         text        PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id   uuid        NOT NULL REFERENCES public.agent_web_threads(id) ON DELETE CASCADE,
  turn_id     uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_idempotency_keys_created_at
  ON public.agent_idempotency_keys (created_at);

ALTER TABLE public.agent_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_idempotency_keys_select_own"
  ON public.agent_idempotency_keys FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "agent_idempotency_keys_service_all"
  ON public.agent_idempotency_keys FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- TTL via pg_cron (hourly)
DO $$
DECLARE v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'agent_idempotency_keys_ttl';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'agent_idempotency_keys_ttl',
  '7 * * * *',
  $$ DELETE FROM public.agent_idempotency_keys WHERE created_at < now() - interval '24 hours'; $$
);

-- ----------------------------------------------------------------------------
-- 8. agent_audit_log — per-turn audit trail (also partitioned, lighter)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  user_id     uuid        NOT NULL,
  agent_id    uuid        NOT NULL,
  thread_id   uuid        NOT NULL,
  turn_id     uuid        NOT NULL,
  event_type  text        NOT NULL,            -- 'turn_started','turn_completed','turn_aborted','budget_exceeded','tool_loop_detected','sigterm_drain','rls_denied'
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (created_at, id)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_agent_audit_log_org_recent
  ON public.agent_audit_log (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_log_turn
  ON public.agent_audit_log (turn_id);

ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_audit_log_select_admin"
  ON public.agent_audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = (select auth.uid())
        AND om.org_id  = agent_audit_log.org_id
        AND om.role IN ('admin','manager')
    )
  );
CREATE POLICY "agent_audit_log_service_all"
  ON public.agent_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.ensure_agent_audit_log_partition(p_month_start date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_part_name text := format('agent_audit_log_y%sm%s',
                             to_char(p_month_start, 'YYYY'),
                             to_char(p_month_start, 'MM'));
  v_next      date := (p_month_start + interval '1 month')::date;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_audit_log
       FOR VALUES FROM (%L) TO (%L)',
    v_part_name, p_month_start, v_next);
END;
$$;

SELECT public.ensure_agent_audit_log_partition(date_trunc('month', now())::date);
SELECT public.ensure_agent_audit_log_partition((date_trunc('month', now()) + interval '1 month')::date);
SELECT public.ensure_agent_audit_log_partition((date_trunc('month', now()) + interval '2 month')::date);

-- Roll audit partitions monthly (audit retention is longer — 1 year)
CREATE OR REPLACE FUNCTION public.roll_agent_audit_log_partitions()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_old    record;
  v_cutoff date := (date_trunc('month', now()) - interval '12 month')::date;
BEGIN
  PERFORM public.ensure_agent_audit_log_partition(date_trunc('month', now())::date);
  PERFORM public.ensure_agent_audit_log_partition((date_trunc('month', now()) + interval '1 month')::date);
  PERFORM public.ensure_agent_audit_log_partition((date_trunc('month', now()) + interval '2 month')::date);

  FOR v_old IN
    SELECT child.relname AS partition_name,
           pg_get_expr(child.relpartbound, child.oid) AS bounds
    FROM   pg_inherits i
    JOIN   pg_class parent ON parent.oid = i.inhparent
    JOIN   pg_class child  ON child.oid  = i.inhrelid
    WHERE  parent.relname = 'agent_audit_log'
  LOOP
    IF substring(v_old.bounds FROM 'TO \(''([0-9-]+)''\)')::date <= v_cutoff THEN
      EXECUTE format('ALTER TABLE public.agent_audit_log DETACH PARTITION public.%I',
                     v_old.partition_name);
      EXECUTE format('DROP TABLE public.%I', v_old.partition_name);
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE v_jobid int;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'agent_audit_log_roll';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'agent_audit_log_roll',
  '15 3 1 * *',
  $$ SELECT public.roll_agent_audit_log_partitions(); $$
);

-- ----------------------------------------------------------------------------
-- 9. updated_at trigger (reuse existing helper if present)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_agent_web_threads_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_web_threads;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.agent_web_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_agent_web_threads_set_updated_at();

-- ============================================================================
-- END OF DRAFT
-- ============================================================================
