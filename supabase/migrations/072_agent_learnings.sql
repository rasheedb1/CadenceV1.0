-- =====================================================
-- 072: Agent learnings — self-improving agents
-- Agents store lessons learned from tasks to improve over time
-- =====================================================

CREATE TABLE IF NOT EXISTS public.agent_learnings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  learning text NOT NULL,
  context text,
  source_task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_learnings_agent
  ON public.agent_learnings (agent_id, created_at DESC);

ALTER TABLE public.agent_learnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_learnings"
  ON public.agent_learnings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_learnings"
  ON public.agent_learnings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_learnings.org_id
      AND organization_members.user_id = auth.uid()
  ));
