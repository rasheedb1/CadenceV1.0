-- =====================================================
-- 075: Agent Projects — autonomous multi-phase work
-- Projects survive restarts, agents resume from DB state
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'failed')),
  owner_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  notify_whatsapp boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_projects_org_status
  ON public.agent_projects (org_id, status);

ALTER TABLE public.agent_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_projects"
  ON public.agent_projects FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_projects"
  ON public.agent_projects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_projects.org_id
      AND organization_members.user_id = auth.uid()
  ));

-- Phases within a project
CREATE TABLE IF NOT EXISTS public.agent_project_phases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.agent_projects(id) ON DELETE CASCADE,
  phase_number int NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  reviewer_agent_id uuid REFERENCES public.agents(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'review', 'approved', 'completed', 'failed', 'needs_input')),
  result text,
  feedback text,
  task_id uuid REFERENCES public.agent_tasks(id),
  max_review_iterations int DEFAULT 2,
  current_review_iteration int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_project_phases_project
  ON public.agent_project_phases (project_id, phase_number);

ALTER TABLE public.agent_project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_project_phases"
  ON public.agent_project_phases FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_project_phases"
  ON public.agent_project_phases FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.agent_projects
    JOIN public.organization_members ON organization_members.org_id = agent_projects.org_id
    WHERE agent_projects.id = agent_project_phases.project_id
      AND organization_members.user_id = auth.uid()
  ));

-- Enable Realtime for Mission Control visibility
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_project_phases;
