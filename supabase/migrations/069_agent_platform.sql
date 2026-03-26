-- =====================================================
-- 069: Agent Platform Tables
-- Chief Agent Platform — multi-agent AI infrastructure
-- =====================================================

-- 1. agents — Core agent registry
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  description text,
  soul_md text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'deploying', 'active', 'paused', 'error', 'destroyed')),
  railway_service_id text,
  railway_url text,
  config jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_org_status ON public.agents (org_id, status);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agents"
  ON public.agents FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agents"
  ON public.agents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agents.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 2. agent_skills — Skills assigned to each agent
CREATE TABLE IF NOT EXISTS public.agent_skills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  skill_config jsonb DEFAULT '{}'::jsonb,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_skills_unique
  ON public.agent_skills (agent_id, skill_name);

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_skills"
  ON public.agent_skills FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_skills"
  ON public.agent_skills FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents
      JOIN public.organization_members ON organization_members.org_id = agents.org_id
      WHERE agents.id = agent_skills.agent_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 3. agent_tasks — Task delegation tracking
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  delegated_by text NOT NULL,
  instruction text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_org_agent_status
  ON public.agent_tasks (org_id, agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_created
  ON public.agent_tasks (agent_id, created_at DESC);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_tasks"
  ON public.agent_tasks FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_tasks"
  ON public.agent_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agent_tasks.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 4. agent_messages — Inter-agent communication log
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  to_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.agent_tasks(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_task
  ON public.agent_messages (task_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_org
  ON public.agent_messages (org_id, created_at DESC);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on agent_messages"
  ON public.agent_messages FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Org members can view agent_messages"
  ON public.agent_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_members.org_id = agent_messages.org_id
        AND organization_members.user_id = auth.uid()
    )
  );

-- 5. skill_registry — Global skill catalog (shared across orgs)
CREATE TABLE IF NOT EXISTS public.skill_registry (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  skill_definition text NOT NULL,
  requires_integrations text[] DEFAULT '{}',
  is_system boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.skill_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on skill_registry"
  ON public.skill_registry FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view skill_registry"
  ON public.skill_registry FOR SELECT
  USING (auth.role() = 'authenticated');
