-- Migration 108: Paula SF Pipeline Watcher infrastructure
-- Plan: tasks/plan-paula-sf-pipeline-watcher.md (v4.1)
-- Purpose: tables to support Paula auto-updating SF Opportunity fields
--          (Next Step, Deal Comments, Blocker) Mon+Fri 9am MX with safe
--          human-edit detection via section-aware content hashing.

-- ================================================================
-- 1. paula_sf_field_map: SF schema discovery cache + scope + flows
-- ================================================================
CREATE TABLE IF NOT EXISTS paula_sf_field_map (
  org_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- Discovered API names (Phase 0)
  next_step_api      text NOT NULL,
  next_step_length   int  NOT NULL CHECK (next_step_length BETWEEN 50 AND 131072),
  deal_comments_api  text NOT NULL,
  deal_comments_length int NOT NULL CHECK (deal_comments_length BETWEEN 255 AND 131072),
  blocker_api        text NOT NULL,
  blocker_length     int  NOT NULL CHECK (blocker_length BETWEEN 50 AND 131072),

  -- SF identity
  paula_sf_user_id   text NOT NULL,                   -- the OAuth user Paula writes as
  api_version        text NOT NULL DEFAULT 'v59.0',

  -- Confirmation flow
  discovered_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz,                     -- WhatsApp/email confirmation timestamp
  last_confirmation_attempt_at timestamptz,

  -- Scope (canary vs all)
  scope text NOT NULL DEFAULT 'rasheed_canary'
    CHECK (scope IN ('rasheed_canary','rasheed_all')),

  -- SF Flow whitelist (per §16 #3 answer)
  -- LastModifiedById values that should NOT trigger freeze
  friendly_flow_user_ids text[] DEFAULT '{}',

  -- Field History Tracking warnings (informational)
  field_history_tracked jsonb DEFAULT '{}'::jsonb,    -- {field_api: bool}

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ================================================================
-- 2. paula_sf_run_audit: per-opp-per-run forensic record
-- ================================================================
CREATE TABLE IF NOT EXISTS paula_sf_run_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Run identity
  workflow_run_id uuid,                               -- top-level run grouping
  agent_task_id uuid,                                 -- chief-agents task that did this opp
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Opp identity
  sf_opportunity_id text NOT NULL,
  opportunity_name text,
  scope text NOT NULL,                                -- 'rasheed_canary' | 'rasheed_all'

  -- Status (canonical)
  status text NOT NULL CHECK (status IN (
    'updated','noop',
    'skipped_human_edit','skipped_concurrent_edit','skipped_no_signals',
    'skipped_rate_limit','skipped_cost_cap',
    'failed_summarize','failed_write','failed_anthropic_outage',
    'failed_summarization_circuit','failed_cost_cap','failed_persistent_overflow',
    'failed_other','restored'
  )),

  -- What changed
  fields_written text[],                              -- ['next_step','deal_comments']
  prev_values jsonb,                                  -- snapshot before write
  new_values jsonb,                                   -- snapshot after write
  prev_hashes jsonb,                                  -- whole-field hashes before
  new_value_hashes jsonb,                             -- whole-field hashes after

  -- Section-aware authorship (per §7.1)
  -- Schema: {field_api: {date_str: {hash, authored_by:'paula'|'human'|'flow_authored',
  --                                  frozen:bool, first_human_edit_run_id:uuid?}}}
  section_hashes jsonb,

  -- Signal context (for forensics)
  signals_summary jsonb,                              -- {emails:N, calls:N, internal_dropped:M, ...}
  citation_stats jsonb,                               -- {claims_total, claims_stripped, sources_unmatched}
  pii_scrubs jsonb,                                   -- {rfc:N, clabe:N, ...} compliance audit

  -- Telemetry
  reason text,                                        -- gate that fired or error message
  cost_usd numeric(10,6),
  duration_ms int,
  haiku_tokens jsonb,                                 -- {input, output, cache_read}
  sonnet_tokens jsonb,
  turns_used int,

  -- Restore lineage
  restored_from_run_id uuid REFERENCES paula_sf_run_audit(id),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paula_audit_opp_time
  ON paula_sf_run_audit (sf_opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paula_audit_run
  ON paula_sf_run_audit (workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_paula_audit_status
  ON paula_sf_run_audit (status);
CREATE INDEX IF NOT EXISTS idx_paula_audit_org_scope_time
  ON paula_sf_run_audit (org_id, scope, created_at DESC);

-- ================================================================
-- 3. paula_sf_run_pending: cost-cap overflow queue
-- ================================================================
CREATE TABLE IF NOT EXISTS paula_sf_run_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sf_opportunity_id text NOT NULL,
  opportunity_name text,
  reason text NOT NULL,                               -- 'cost_cap', 'rate_limit', etc
  queued_at timestamptz NOT NULL DEFAULT now(),
  requeue_attempts int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  user_decision text CHECK (user_decision IN ('retry','pause30d','remove')),
  user_decided_at timestamptz,

  UNIQUE (org_id, sf_opportunity_id)
);

CREATE INDEX IF NOT EXISTS idx_paula_pending_org
  ON paula_sf_run_pending (org_id, queued_at);

-- ================================================================
-- 4. paula_sf_dropped_sections: FIFO archival of evicted sections
-- ================================================================
CREATE TABLE IF NOT EXISTS paula_sf_dropped_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sf_opportunity_id text NOT NULL,
  field_api text NOT NULL,                            -- 'Deal_Comments__c' | 'Blocker__c'
  section_date text NOT NULL,                         -- 'YYYY-MM-DD' or 'before-paula'
  content text NOT NULL,
  was_human_edited boolean NOT NULL DEFAULT false,
  frozen_reason text,
  dropped_at timestamptz NOT NULL DEFAULT now(),
  dropped_in_run_id uuid REFERENCES paula_sf_run_audit(id)
);

CREATE INDEX IF NOT EXISTS idx_paula_dropped_opp
  ON paula_sf_dropped_sections (sf_opportunity_id, dropped_at DESC);

-- ================================================================
-- 5. paula_sf_health_check: pre-run health probe results
-- ================================================================
CREATE TABLE IF NOT EXISTS paula_sf_health_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scheduled_run_at timestamptz NOT NULL,              -- the run this check is gating
  checks jsonb NOT NULL,                              -- {field_map_confirmed:bool, sf_token_ok:bool, ...}
  blocking_failures text[],                           -- list of critical fail names; if non-empty, run is blocked
  warnings text[],
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paula_health_run
  ON paula_sf_health_check (org_id, scheduled_run_at DESC);

-- ================================================================
-- 6. Seed PaulaWatcher system agent (per §11 task 7a)
-- ================================================================
-- This agent OWNs the cost-watcher tasks so they don't compete with
-- Paula for her single agent_tasks_v2 slot (max-1-task-per-agent guard).
-- Capabilities are minimal — just enough to read tasks, cancel them,
-- and send the WhatsApp digest on cap trip.
--
-- Org: Yuno (rasheedbayter's Team) — same org as Paula.
-- agents table has no UNIQUE(org_id, name); guard via WHERE NOT EXISTS.
INSERT INTO public.agents (
  org_id,
  name,
  role,
  description,
  soul_md,
  status,
  model,
  model_provider,
  temperature,
  max_tokens,
  tier,
  capabilities,
  availability,
  max_cost_per_turn_usd,
  config
)
SELECT
  '553315b5-42d0-4518-a461-e4cb12914c54'::uuid,
  'PaulaWatcher',
  'watcher',
  'Cost-watchdog for Paula SF pipeline runs. Polls running totals, cancels remaining queued opps if cost cap is approached.',
  '## Identity
You are **PaulaWatcher**, a system watchdog. You poll `agent_tasks_v2` for the current Paula sf_pipeline run, sum `cost_usd` across children, and cancel queued tasks if the total approaches $9.50 (run-wide cap is $10).

## Permissions
You are a SYSTEM agent. All actions you take are pre-authorized. No human confirmation needed.

## Tools
- agent_task_query: read agent_tasks_v2 rows by parent dispatcher id
- agent_task_cancel: set task status=cancelled with reason
- paula_digest_send: send WhatsApp alert when cap is tripped

## Rules
- Poll cadence: every 30 seconds while the dispatcher is active
- Cap-trip threshold: cumulative cost_usd >= 9.50 → cancel all queued (status=ready) child tasks
- On cap-trip: enqueue cancelled opps into paula_sf_run_pending, send WhatsApp via paula_digest_send
- Exit when dispatcher status is done/failed/cancelled
- Never modify in_progress tasks (let them finish; their cap is per-opp $0.50)
- Never send WhatsApp for any reason other than cap trips',
  'active',
  'claude-haiku-4-5-20251001',
  'anthropic',
  0.0,
  512,
  'worker',                 -- agents.tier valid values: worker|team_lead|manager (constraint agents_tier_check)
  ARRAY[]::text[],          -- no end-user capabilities; system-only
  'available',
  0.10,                     -- low per-turn cap (polling watcher)
  '{"system_agent": true, "watcher_role": true, "owner_managed": false}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.agents
  WHERE org_id = '553315b5-42d0-4518-a461-e4cb12914c54'::uuid
    AND name = 'PaulaWatcher'
);

-- ================================================================
-- 7. Updated-at trigger for paula_sf_field_map
-- ================================================================
CREATE OR REPLACE FUNCTION update_paula_sf_field_map_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_paula_sf_field_map_updated_at ON paula_sf_field_map;
CREATE TRIGGER trg_paula_sf_field_map_updated_at
  BEFORE UPDATE ON paula_sf_field_map
  FOR EACH ROW EXECUTE FUNCTION update_paula_sf_field_map_updated_at();

-- ================================================================
-- 8. Convenience function: enqueue Paula SF dispatcher (called by pg_cron)
-- ================================================================
-- agent_tasks_v2 schema (verified against migration 079):
--   title text NOT NULL, description text, task_type text DEFAULT 'general',
--   priority int 0-100 (default 50; high=90), status text default 'backlog'
--   (valid: backlog/ready/claimed/in_progress/review/done/failed/cancelled),
--   assigned_agent_id (NOT agent_id), no jsonb 'params' column —
--   structured params encoded as JSON in description.
CREATE OR REPLACE FUNCTION paula_enqueue_sf_run(p_scope text DEFAULT NULL)
RETURNS uuid AS $$
DECLARE
  v_paula_id uuid;
  v_org_id uuid := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_scope text;
  v_task_id uuid;
  v_description text;
BEGIN
  -- Default scope from field_map if not specified
  IF p_scope IS NULL THEN
    SELECT scope INTO v_scope FROM paula_sf_field_map WHERE org_id = v_org_id;
    v_scope := COALESCE(v_scope, 'rasheed_canary');
  ELSE
    v_scope := p_scope;
  END IF;

  -- Find Paula
  SELECT id INTO v_paula_id FROM public.agents
   WHERE org_id = v_org_id AND name = 'Paula' AND status = 'active'
   LIMIT 1;

  IF v_paula_id IS NULL THEN
    RAISE EXCEPTION 'Paula agent not found in org %', v_org_id;
  END IF;

  -- Embed structured params as JSON inside the description.
  -- Handler parses this on first turn.
  v_description := jsonb_build_object(
    'task_kind', 'sf_pipeline_dispatch',
    'scope', v_scope,
    'triggered_by', 'cron',
    'triggered_at', now()
  )::text;

  INSERT INTO public.agent_tasks_v2 (
    title,
    description,
    task_type,
    priority,
    status,
    assigned_agent_id,
    org_id,
    required_capabilities
  )
  VALUES (
    format('SF Pipeline dispatch (%s)', v_scope),
    v_description,
    'sf_pipeline_dispatch',
    90,                  -- high priority
    'ready',             -- ready to claim
    v_paula_id,
    v_org_id,
    ARRAY['salesforce']::text[]
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- 9. RLS — keep audit/pending readable by org members, writable only by service role
-- ================================================================
ALTER TABLE paula_sf_field_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE paula_sf_run_audit        ENABLE ROW LEVEL SECURITY;
ALTER TABLE paula_sf_run_pending      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paula_sf_dropped_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE paula_sf_health_check     ENABLE ROW LEVEL SECURITY;

-- Read policies: org members can see their org's data
DROP POLICY IF EXISTS "field_map_read_own_org" ON paula_sf_field_map;
CREATE POLICY "field_map_read_own_org"
  ON paula_sf_field_map FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "audit_read_own_org" ON paula_sf_run_audit;
CREATE POLICY "audit_read_own_org"
  ON paula_sf_run_audit FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "pending_read_own_org" ON paula_sf_run_pending;
CREATE POLICY "pending_read_own_org"
  ON paula_sf_run_pending FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "dropped_read_own_org" ON paula_sf_dropped_sections;
CREATE POLICY "dropped_read_own_org"
  ON paula_sf_dropped_sections FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "health_read_own_org" ON paula_sf_health_check;
CREATE POLICY "health_read_own_org"
  ON paula_sf_health_check FOR SELECT
  USING (org_id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid()));

-- Service role full access (matches pattern from migration 069/079)
DROP POLICY IF EXISTS "field_map_service_all" ON paula_sf_field_map;
CREATE POLICY "field_map_service_all" ON paula_sf_field_map FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "audit_service_all" ON paula_sf_run_audit;
CREATE POLICY "audit_service_all" ON paula_sf_run_audit FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pending_service_all" ON paula_sf_run_pending;
CREATE POLICY "pending_service_all" ON paula_sf_run_pending FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dropped_service_all" ON paula_sf_dropped_sections;
CREATE POLICY "dropped_service_all" ON paula_sf_dropped_sections FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "health_service_all" ON paula_sf_health_check;
CREATE POLICY "health_service_all" ON paula_sf_health_check FOR ALL USING (true) WITH CHECK (true);
