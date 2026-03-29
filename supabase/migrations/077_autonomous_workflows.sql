-- =====================================================
-- 077: Autonomous Workflows — collaboration mode
-- Extends agent_projects for iterative agent-to-agent loops
-- =====================================================

-- Add collaboration columns to agent_projects
ALTER TABLE public.agent_projects
  ADD COLUMN IF NOT EXISTS workflow_type text DEFAULT 'sequential'
    CHECK (workflow_type IN ('sequential', 'collaboration')),
  ADD COLUMN IF NOT EXISTS max_iterations int DEFAULT 10,
  ADD COLUMN IF NOT EXISTS current_iteration int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoint_every int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS project_memory text,
  ADD COLUMN IF NOT EXISTS assigned_agents uuid[],
  ADD COLUMN IF NOT EXISTS success_criteria text;

-- Iteration history — one row per agent turn in collaboration mode
CREATE TABLE IF NOT EXISTS public.agent_project_iterations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  iteration_number int NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  action text NOT NULL CHECK (action IN ('produce', 'review', 'refine', 'checkpoint', 'complete')),
  input_summary text,
  output_summary text,
  output_full text,
  duration_ms int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_iterations
  ON public.agent_project_iterations (project_id, iteration_number);

ALTER TABLE public.agent_project_iterations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_project_iterations"
  ON public.agent_project_iterations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_project_iterations"
  ON public.agent_project_iterations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agent_projects
    JOIN public.organization_members ON organization_members.org_id = agent_projects.org_id
    WHERE agent_projects.id = agent_project_iterations.project_id
      AND organization_members.user_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_project_iterations;
