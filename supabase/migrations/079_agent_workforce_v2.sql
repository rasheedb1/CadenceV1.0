-- =====================================================
-- 079: Agent Workforce v2 — Scalable AI Employee System
-- Adds: hierarchy, model config, capabilities, teams,
--        task engine v2, check-ins, performance metrics
-- =====================================================

-- =============================================================
-- PART 1: Extend agents table with workforce columns
-- =============================================================

-- Model configuration
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS model text DEFAULT 'claude-sonnet-4-6';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS model_provider text DEFAULT 'anthropic';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS temperature numeric(3,2) DEFAULT 0.7;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS max_tokens integer DEFAULT 4096;

-- Hierarchy & teams
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS parent_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS team text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS tier text DEFAULT 'worker'
  CHECK (tier IN ('worker', 'team_lead', 'manager'));

-- Capabilities & objectives
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS capabilities text[] DEFAULT '{}';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS objectives jsonb DEFAULT '[]'::jsonb;

-- Availability (richer than heartbeat status)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS availability text DEFAULT 'available'
  CHECK (availability IN ('available', 'working', 'blocked', 'on_project', 'offline'));

-- Index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_agents_parent ON public.agents (parent_agent_id) WHERE parent_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agents_team ON public.agents (org_id, team) WHERE team IS NOT NULL;

-- =============================================================
-- PART 2: agent_tasks_v2 — Priority-based task backlog
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_tasks_v2 (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Project/sprint grouping
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.agent_tasks_v2(id) ON DELETE SET NULL,

  -- Task definition
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'general',
  required_capabilities text[] DEFAULT '{}',
  priority integer DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  story_points integer,

  -- Assignment
  assigned_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  assigned_at timestamptz,

  -- Dependencies
  depends_on uuid[] DEFAULT '{}',

  -- Status
  status text NOT NULL DEFAULT 'backlog'
    CHECK (status IN ('backlog', 'ready', 'claimed', 'in_progress', 'review', 'done', 'failed', 'cancelled')),
  progress_pct integer DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),

  -- Execution
  started_at timestamptz,
  completed_at timestamptz,
  result jsonb,
  error text,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,

  -- Token/cost tracking per task
  tokens_used integer DEFAULT 0,
  cost_usd numeric(10,4) DEFAULT 0,

  -- Audit
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Priority queue index: ready tasks, unassigned, by priority
CREATE INDEX IF NOT EXISTS idx_tasks_v2_claimable
  ON public.agent_tasks_v2 (org_id, priority ASC, created_at ASC)
  WHERE status = 'ready' AND assigned_agent_id IS NULL;

-- Agent workload index
CREATE INDEX IF NOT EXISTS idx_tasks_v2_assigned
  ON public.agent_tasks_v2 (assigned_agent_id, status)
  WHERE status IN ('claimed', 'in_progress');

-- Project tasks
CREATE INDEX IF NOT EXISTS idx_tasks_v2_project
  ON public.agent_tasks_v2 (project_id, status)
  WHERE project_id IS NOT NULL;

-- Subtask index
CREATE INDEX IF NOT EXISTS idx_tasks_v2_parent
  ON public.agent_tasks_v2 (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

ALTER TABLE public.agent_tasks_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_tasks_v2"
  ON public.agent_tasks_v2 FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_tasks_v2"
  ON public.agent_tasks_v2 FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agent_tasks_v2.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- Realtime for Mission Control
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks_v2;

-- =============================================================
-- PART 3: agent_checkins — Standup / feedback loop
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_checkins (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE SET NULL,

  -- Check-in type
  checkin_type text NOT NULL DEFAULT 'standup'
    CHECK (checkin_type IN ('standup', 'phase_complete', 'blocked', 'milestone', 'review_request')),

  -- Content
  summary text NOT NULL,
  next_steps text,
  blockers text,
  tasks_completed_ids uuid[] DEFAULT '{}',

  -- Approval flow
  needs_approval boolean DEFAULT false,
  status text DEFAULT 'sent'
    CHECK (status IN ('sent', 'seen', 'approved', 'rejected', 'expired')),
  feedback text,
  responded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at timestamptz,

  -- Timeout
  expires_at timestamptz,
  fallback_action text DEFAULT 'continue'
    CHECK (fallback_action IN ('continue', 'pause', 'escalate')),

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_agent ON public.agent_checkins (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_pending ON public.agent_checkins (org_id, status)
  WHERE needs_approval = true AND status = 'sent';

ALTER TABLE public.agent_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_checkins"
  ON public.agent_checkins FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_checkins"
  ON public.agent_checkins FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agent_checkins.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_checkins;

-- =============================================================
-- PART 4: agent_performance — Metrics per agent per period
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_performance (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,

  -- Throughput
  tasks_completed integer DEFAULT 0,
  tasks_failed integer DEFAULT 0,
  avg_completion_seconds integer,

  -- Quality
  tasks_reworked integer DEFAULT 0,
  human_escalations integer DEFAULT 0,
  error_rate numeric(5,2) DEFAULT 0,

  -- Cost
  total_tokens bigint DEFAULT 0,
  total_cost_usd numeric(10,2) DEFAULT 0,
  cost_per_task numeric(10,2) DEFAULT 0,

  -- Efficiency
  idle_time_pct numeric(5,2) DEFAULT 0,
  utilization_pct numeric(5,2) DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_perf_agent_period
  ON public.agent_performance (agent_id, period_start, period_end);

ALTER TABLE public.agent_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_performance"
  ON public.agent_performance FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_performance"
  ON public.agent_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agent_performance.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- =============================================================
-- PART 5: claim_task_v2 — Atomic task claiming function
-- =============================================================

CREATE OR REPLACE FUNCTION public.claim_task_v2(
  p_org_id uuid,
  p_agent_id uuid,
  p_capabilities text[] DEFAULT '{}'
)
RETURNS SETOF public.agent_tasks_v2
LANGUAGE plpgsql
AS $$
DECLARE
  v_task public.agent_tasks_v2;
BEGIN
  -- Atomically claim the highest-priority ready task
  -- that matches agent capabilities and has resolved dependencies
  SELECT * INTO v_task
  FROM public.agent_tasks_v2 t
  WHERE t.org_id = p_org_id
    AND t.status = 'ready'
    AND t.assigned_agent_id IS NULL
    -- Capability match: task requires none, or agent has at least one
    AND (
      t.required_capabilities = '{}'
      OR t.required_capabilities && p_capabilities
    )
    -- Dependency check: all depends_on tasks must be done
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(t.depends_on) AS dep_id
      JOIN public.agent_tasks_v2 dep ON dep.id = dep_id
      WHERE dep.status != 'done'
    )
  ORDER BY t.priority ASC, t.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_task.id IS NULL THEN
    RETURN;  -- No claimable task found
  END IF;

  -- Claim it
  UPDATE public.agent_tasks_v2
  SET status = 'claimed',
      assigned_agent_id = p_agent_id,
      assigned_at = now(),
      updated_at = now()
  WHERE id = v_task.id;

  -- Return the claimed task
  v_task.status := 'claimed';
  v_task.assigned_agent_id := p_agent_id;
  v_task.assigned_at := now();
  RETURN NEXT v_task;
END;
$$;

-- =============================================================
-- PART 6: Resolve dependencies when a task completes
-- =============================================================

CREATE OR REPLACE FUNCTION public.resolve_task_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When a task is marked done, check if it unblocks other tasks
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    UPDATE public.agent_tasks_v2
    SET status = 'ready',
        updated_at = now()
    WHERE status = 'backlog'
      AND org_id = NEW.org_id
      AND NEW.id = ANY(depends_on)
      -- Only move to ready if ALL dependencies are done
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(depends_on) AS dep_id
        JOIN public.agent_tasks_v2 dep ON dep.id = dep_id
        WHERE dep.status != 'done'
          AND dep.id != NEW.id  -- Exclude the one we just completed
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_dependencies
  AFTER UPDATE ON public.agent_tasks_v2
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status != 'done')
  EXECUTE FUNCTION public.resolve_task_dependencies();

-- =============================================================
-- PART 7: agent_standup view — Daily summary per agent
-- =============================================================

CREATE OR REPLACE VIEW public.agent_standup AS
SELECT
  a.id AS agent_id,
  a.name AS agent_name,
  a.role AS agent_role,
  a.team,
  a.tier,
  a.availability,
  a.model,

  -- Tasks completed last 24h
  (SELECT count(*)
   FROM public.agent_tasks_v2 t
   WHERE t.assigned_agent_id = a.id
     AND t.status = 'done'
     AND t.completed_at > now() - interval '24 hours'
  ) AS tasks_done_24h,

  -- Tasks in progress
  (SELECT count(*)
   FROM public.agent_tasks_v2 t
   WHERE t.assigned_agent_id = a.id
     AND t.status IN ('claimed', 'in_progress')
  ) AS tasks_in_progress,

  -- Tasks in backlog
  (SELECT count(*)
   FROM public.agent_tasks_v2 t
   WHERE t.assigned_agent_id = a.id
     AND t.status IN ('backlog', 'ready')
  ) AS tasks_backlog,

  -- Blocked tasks
  (SELECT count(*)
   FROM public.agent_tasks_v2 t
   WHERE t.assigned_agent_id = a.id
     AND t.status = 'failed'
  ) AS tasks_blocked,

  -- Pending check-ins needing approval
  (SELECT count(*)
   FROM public.agent_checkins c
   WHERE c.agent_id = a.id
     AND c.needs_approval = true
     AND c.status = 'sent'
  ) AS pending_checkins,

  -- Last heartbeat
  h.last_seen,
  h.status AS heartbeat_status,
  h.current_task

FROM public.agents a
LEFT JOIN public.agent_heartbeats h ON h.agent_id = a.id
WHERE a.status != 'destroyed';
