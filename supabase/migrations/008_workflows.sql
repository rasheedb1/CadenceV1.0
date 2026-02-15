-- =====================================================
-- WORKFLOWS - Conditional LinkedIn Automation Flows
-- =====================================================

-- 1. WORKFLOWS - Main workflow definitions
CREATE TABLE IF NOT EXISTS public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Workflow',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  graph_json JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'new_lead_added')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WORKFLOW_RUNS - Per-lead execution tracking
CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  current_node_id TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'waiting', 'completed', 'failed', 'paused')),
  waiting_until TIMESTAMPTZ,
  waiting_for_event TEXT,
  context_json JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workflow_id, lead_id)
);

-- 3. WORKFLOW_EVENT_LOG - Audit trail for workflow execution
CREATE TABLE IF NOT EXISTS public.workflow_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_workflows_owner_id ON public.workflows(owner_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON public.workflows(status);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON public.workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_lead_id ON public.workflow_runs(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner_id ON public.workflow_runs(owner_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON public.workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_waiting ON public.workflow_runs(status, waiting_until)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_workflow_event_log_run_id ON public.workflow_event_log(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_log_workflow_id ON public.workflow_event_log(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_log_lead_id ON public.workflow_event_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_workflow_event_log_created_at ON public.workflow_event_log(created_at);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_event_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - Workflows
-- =====================================================
CREATE POLICY "Users can view own workflows" ON public.workflows
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own workflows" ON public.workflows
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own workflows" ON public.workflows
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own workflows" ON public.workflows
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Workflow Runs
-- =====================================================
CREATE POLICY "Users can view own workflow runs" ON public.workflow_runs
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own workflow runs" ON public.workflow_runs
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own workflow runs" ON public.workflow_runs
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own workflow runs" ON public.workflow_runs
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Workflow Event Log
-- =====================================================
CREATE POLICY "Users can view own workflow event log" ON public.workflow_event_log
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can create own workflow event log" ON public.workflow_event_log
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workflow_runs_updated_at
  BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
