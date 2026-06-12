-- ============================================================================
-- S3-bench.sql — Synthetic load + EXPLAIN harness for agent_chat_events
-- ============================================================================
-- DRAFT — to be executed in Phase 1 against a staging Supabase project AFTER
-- the migration is applied. NEVER run against production.
--
-- Scenario: 10M rows total
--   100 orgs × 10 users/org × 100 threads/user × 100 events/thread = 10,000,000
--
-- This script measures:
--   (1) Bulk seed time (sanity).
--   (2) Hot query — `where thread_id = ? order by created_at desc limit 100`
--       under three conditions:
--         a. service_role (RLS bypassed)              ← upper bound
--         b. authenticated user, owner of thread       ← realistic prod path
--         c. authenticated user, foreign thread        ← must return 0 rows
--   (3) Partition pruning — confirm only 1 partition is touched.
--
-- Pass criteria (per plan §6 Spike S3): p95 < 5ms on (2b) at 10M rows.
-- ============================================================================

\timing on
\set VERBOSITY verbose

-- Run as service_role / supabase admin connection.
SET search_path = public, extensions;

-- ----------------------------------------------------------------------------
-- 0. Pre-flight — confirm partitioning is in place
-- ----------------------------------------------------------------------------
SELECT
  parent.relname AS parent,
  count(*)        AS partition_count
FROM pg_inherits i
JOIN pg_class parent ON parent.oid = i.inhparent
WHERE parent.relname IN ('agent_chat_events', 'agent_audit_log')
GROUP BY 1;

-- ----------------------------------------------------------------------------
-- 1. Seed harness — fake orgs, users, threads
-- ----------------------------------------------------------------------------
-- We seed UUIDs into a staging table so we can pick a deterministic "hot"
-- thread_id at query time. Real auth.users rows are NOT created — we only
-- need the FK relations for events/threads, and those FKs target auth.users.
-- For benchmarking we DROP the FK to auth.users on the threads table first
-- so we can use synthetic uuids; restore at end.
-- ----------------------------------------------------------------------------
BEGIN;

ALTER TABLE public.agent_web_threads DROP CONSTRAINT IF EXISTS agent_web_threads_user_id_fkey;
ALTER TABLE public.agent_web_threads DROP CONSTRAINT IF EXISTS agent_web_threads_agent_id_fkey;
ALTER TABLE public.agent_web_threads DROP CONSTRAINT IF EXISTS agent_web_threads_org_id_fkey;

CREATE TEMP TABLE bench_orgs    (id uuid PRIMARY KEY);
CREATE TEMP TABLE bench_users   (id uuid PRIMARY KEY, org_id uuid);
CREATE TEMP TABLE bench_threads (id uuid PRIMARY KEY, org_id uuid, user_id uuid);

INSERT INTO bench_orgs(id)
SELECT gen_random_uuid() FROM generate_series(1,100);

INSERT INTO bench_users(id, org_id)
SELECT gen_random_uuid(), o.id
FROM bench_orgs o, generate_series(1,10);

-- Pick one synthetic agent_id (FKs already dropped, so any uuid works)
\set agent_id '''00000000-0000-0000-0000-00000000beef'''

INSERT INTO public.agent_web_threads(id, org_id, user_id, agent_id, title, status, last_message_at)
SELECT gen_random_uuid(), u.org_id, u.id, :agent_id::uuid,
       'bench-thread', 'active', now()
FROM bench_users u, generate_series(1,100);

INSERT INTO bench_threads(id, org_id, user_id)
SELECT id, org_id, user_id FROM public.agent_web_threads;

SELECT count(*) AS thread_count FROM public.agent_web_threads;  -- expect 100,000

COMMIT;

-- ----------------------------------------------------------------------------
-- 2. Bulk insert 10M events (100 events / thread).
--    Uses a single set-based INSERT … SELECT — fastest path.
-- ----------------------------------------------------------------------------
\echo 'Seeding 10M events — expect 60-180s on Supabase Pro...'

INSERT INTO public.agent_chat_events
  (id, thread_id, turn_id, org_id, user_id, event_type, payload, created_at)
SELECT
  gen_random_uuid(),
  t.id,
  gen_random_uuid(),
  t.org_id,
  t.user_id,
  CASE (g % 4)
    WHEN 0 THEN 'user_message'
    WHEN 1 THEN 'assistant_chunk'
    WHEN 2 THEN 'tool_call'
    ELSE        'tool_result'
  END,
  jsonb_build_object('seq', g, 'text', repeat('x', 200)),
  now() - (g || ' seconds')::interval
FROM bench_threads t,
     generate_series(1, 100) AS g;

ANALYZE public.agent_chat_events;

SELECT count(*) AS event_count FROM public.agent_chat_events;  -- expect 10,000,000

-- ----------------------------------------------------------------------------
-- 3. Pick the "hot" thread for measurement
-- ----------------------------------------------------------------------------
\set hot_thread_id `psql -At -c "SELECT id FROM bench_threads ORDER BY random() LIMIT 1"`

SELECT id, org_id, user_id INTO TEMP bench_hot
FROM public.agent_web_threads
WHERE id = :'hot_thread_id';

-- ----------------------------------------------------------------------------
-- 4. Hot query — service_role (no RLS)
-- ----------------------------------------------------------------------------
\echo '--- 4a. service_role / no RLS ---'

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT *
FROM   public.agent_chat_events
WHERE  thread_id = :'hot_thread_id'
ORDER  BY created_at DESC, id DESC
LIMIT  100;

-- ----------------------------------------------------------------------------
-- 5. Hot query — authenticated user (RLS active), owner
-- ----------------------------------------------------------------------------
-- Simulate auth.uid() by overriding the JWT claim that Supabase exposes.
-- NB: auth.uid() reads from request.jwt.claim.sub on Supabase.
-- ----------------------------------------------------------------------------
\echo '--- 4b. authenticated, owner ---'

DO $$
DECLARE
  v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM bench_hot LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

SET LOCAL ROLE authenticated;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT *
FROM   public.agent_chat_events
WHERE  thread_id = (SELECT id FROM bench_hot)
ORDER  BY created_at DESC, id DESC
LIMIT  100;

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 6. Hot query — authenticated user, NOT the owner (must return 0)
-- ----------------------------------------------------------------------------
\echo '--- 4c. authenticated, foreign (must be 0 rows) ---'

DO $$
DECLARE
  v_other uuid;
BEGIN
  SELECT id INTO v_other FROM bench_users
   WHERE id <> (SELECT user_id FROM bench_hot LIMIT 1)
   LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
END $$;

SET LOCAL ROLE authenticated;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT count(*)
FROM   public.agent_chat_events
WHERE  thread_id = (SELECT id FROM bench_hot);

RESET ROLE;

-- ----------------------------------------------------------------------------
-- 7. Partition pruning sanity — confirm only 1 partition touched
-- ----------------------------------------------------------------------------
\echo '--- 5. partition pruning ---'

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM   public.agent_chat_events
WHERE  thread_id = (SELECT id FROM bench_hot)
  AND  created_at >= date_trunc('month', now())
ORDER  BY created_at DESC
LIMIT  50;

-- Expect: 'Append' over a single child partition (current month), other
-- partitions pruned. If pg shows "Append" listing all partitions, the
-- planner failed to prune — investigate before Phase 1 ship.

-- ----------------------------------------------------------------------------
-- 8. p95 measurement — 1000 trials of (4b)
-- ----------------------------------------------------------------------------
\echo '--- 6. p95 over 1000 trials ---'

CREATE TEMP TABLE bench_timings (elapsed_ms double precision);

DO $$
DECLARE
  v_user      uuid;
  v_thread    uuid;
  v_start     timestamptz;
  v_count     int;
BEGIN
  SELECT user_id, id INTO v_user, v_thread FROM bench_hot LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);

  FOR i IN 1..1000 LOOP
    v_start := clock_timestamp();
    PERFORM 1
    FROM (
      SELECT *
      FROM   public.agent_chat_events
      WHERE  thread_id = v_thread
      ORDER  BY created_at DESC, id DESC
      LIMIT  100
    ) q;
    INSERT INTO bench_timings(elapsed_ms)
      VALUES (extract(epoch FROM clock_timestamp() - v_start) * 1000);
  END LOOP;
END $$;

SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY elapsed_ms) AS p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY elapsed_ms) AS p95_ms,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY elapsed_ms) AS p99_ms,
  max(elapsed_ms)                                          AS max_ms,
  count(*)                                                 AS samples
FROM bench_timings;

-- PASS if p95_ms < 5. If not, capture EXPLAIN output and re-evaluate indexes.

-- ----------------------------------------------------------------------------
-- 9. Cleanup (only if running in throwaway staging)
-- ----------------------------------------------------------------------------
-- TRUNCATE public.agent_chat_events;
-- TRUNCATE public.agent_web_threads CASCADE;
-- (FKs were dropped at the top — recreate them before restoring to prod-ish state.)
