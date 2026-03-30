-- =====================================================
-- 078: Blackboard System — shared state for agent self-coordination
-- Agents read/write to the blackboard to coordinate without a central orchestrator.
-- =====================================================

-- 1. project_board — Central task/artifact board per project
CREATE TABLE IF NOT EXISTS public.project_board (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('task', 'artifact', 'decision', 'status', 'blocker', 'note')),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- For tasks
  assignee_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  status text DEFAULT 'available' CHECK (status IN ('available', 'claimed', 'working', 'review', 'done', 'blocked', 'cancelled')),
  depends_on uuid[] DEFAULT '{}',
  priority int DEFAULT 0,
  -- Metadata
  written_by uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_project_board_org
  ON public.project_board (org_id);
CREATE INDEX IF NOT EXISTS idx_project_board_project_status
  ON public.project_board (project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_board_assignee
  ON public.project_board (assignee_agent_id) WHERE assignee_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_board_type_status
  ON public.project_board (entry_type, status);
CREATE INDEX IF NOT EXISTS idx_project_board_priority
  ON public.project_board (priority DESC) WHERE status IN ('available', 'blocked');

-- RLS
ALTER TABLE public.project_board ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on project_board"
  ON public.project_board FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view project_board"
  ON public.project_board FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = project_board.org_id
      AND organization_members.user_id = auth.uid()
  ));


-- 2. agent_budgets — Token/cost tracking per agent per project
CREATE TABLE IF NOT EXISTS public.agent_budgets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  tokens_used bigint DEFAULT 0,
  cost_usd decimal(10,4) DEFAULT 0,
  iterations_used int DEFAULT 0,
  max_tokens bigint DEFAULT 1000000,
  max_cost_usd decimal(10,4) DEFAULT 10.00,
  max_iterations int DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_budgets_agent
  ON public.agent_budgets (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_budgets_org
  ON public.agent_budgets (org_id);
CREATE INDEX IF NOT EXISTS idx_agent_budgets_project
  ON public.agent_budgets (project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_budgets_unique
  ON public.agent_budgets (agent_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'));

-- RLS
ALTER TABLE public.agent_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_budgets"
  ON public.agent_budgets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_budgets"
  ON public.agent_budgets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_budgets.org_id
      AND organization_members.user_id = auth.uid()
  ));


-- 3. agent_heartbeats — Health/presence tracking
CREATE TABLE IF NOT EXISTS public.agent_heartbeats (
  agent_id uuid PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'working', 'busy', 'offline')),
  current_task text,
  last_seen timestamptz DEFAULT now(),
  loop_iteration int DEFAULT 0
);

-- Index for finding active agents quickly
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_status
  ON public.agent_heartbeats (status) WHERE status != 'offline';
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_last_seen
  ON public.agent_heartbeats (last_seen DESC);

-- RLS
ALTER TABLE public.agent_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_heartbeats"
  ON public.agent_heartbeats FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view agent_heartbeats"
  ON public.agent_heartbeats FOR SELECT
  USING (auth.role() = 'authenticated');


-- =====================================================
-- Atomic task claim function
-- An agent calls this to claim a task. Uses row-level locking
-- to prevent two agents from claiming the same task.
-- Returns the claimed entry row, or NULL if already claimed.
-- =====================================================
CREATE OR REPLACE FUNCTION public.claim_board_task(
  p_entry_id uuid,
  p_agent_id uuid
) RETURNS public.project_board
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry public.project_board;
BEGIN
  -- Lock the row and check it's still available
  SELECT * INTO v_entry
  FROM public.project_board
  WHERE id = p_entry_id
    AND status = 'available'
    AND entry_type = 'task'
  FOR UPDATE SKIP LOCKED;

  -- If no row found, someone else already claimed it (or it doesn't exist)
  IF v_entry.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check that all dependencies are done
  IF v_entry.depends_on IS NOT NULL AND array_length(v_entry.depends_on, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.project_board
      WHERE id = ANY(v_entry.depends_on)
        AND status != 'done'
    ) THEN
      -- Dependencies not met — don't claim
      RETURN NULL;
    END IF;
  END IF;

  -- Claim it
  UPDATE public.project_board
  SET status = 'claimed',
      assignee_agent_id = p_agent_id,
      claimed_at = now(),
      updated_at = now()
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;


-- =====================================================
-- updated_at trigger (reuse pattern from other tables)
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_board_updated_at
  BEFORE UPDATE ON public.project_board
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_agent_budgets_updated_at
  BEFORE UPDATE ON public.agent_budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =====================================================
-- Realtime — publish all three tables for Mission Control
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_board;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_budgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_heartbeats;
