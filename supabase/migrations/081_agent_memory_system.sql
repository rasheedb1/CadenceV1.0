-- =====================================================
-- 081: Agent Memory System — Artifacts, Reviews, Knowledge
-- Enables: iterative workflows, feedback loops, learning
-- Zero breaking changes — all additive
-- =====================================================

-- =============================================================
-- PART 1: agent_artifacts — Versioned work outputs
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_artifacts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.agent_tasks_v2(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.agent_projects(id) ON DELETE SET NULL,

  -- Identity
  filename text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  artifact_type text NOT NULL DEFAULT 'general'
    CHECK (artifact_type IN ('code', 'design', 'research', 'report', 'review', 'spec', 'general')),

  -- Content
  content text NOT NULL,
  content_summary text,             -- ~200 word summary for prompt injection

  -- Metadata
  created_by uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),

  -- One version per filename per task
  UNIQUE(task_id, filename, version)
);

CREATE INDEX IF NOT EXISTS idx_artifacts_task ON public.agent_artifacts (task_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON public.agent_artifacts (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_agent ON public.agent_artifacts (created_by, created_at DESC);

ALTER TABLE public.agent_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_artifacts"
  ON public.agent_artifacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Org members can view agent_artifacts"
  ON public.agent_artifacts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_artifacts.org_id
      AND organization_members.user_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_artifacts;

-- =============================================================
-- PART 2: agent_reviews — Structured feedback for iteration
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_reviews (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.agent_tasks_v2(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES public.agent_artifacts(id) ON DELETE SET NULL,

  -- Review
  reviewer_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  score numeric(3,2) CHECK (score >= 0 AND score <= 1),
  passed boolean NOT NULL DEFAULT false,
  issues jsonb DEFAULT '[]',        -- [{issue: "...", severity: "high|medium|low"}]
  suggestions jsonb DEFAULT '[]',   -- [{suggestion: "...", priority: "high|medium|low"}]

  -- Iteration tracking
  iteration integer NOT NULL DEFAULT 1,
  max_iterations integer NOT NULL DEFAULT 3,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_task ON public.agent_reviews (task_id, iteration DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON public.agent_reviews (reviewer_agent_id, created_at DESC);

ALTER TABLE public.agent_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_reviews"
  ON public.agent_reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Org members can view agent_reviews"
  ON public.agent_reviews FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_reviews.org_id
      AND organization_members.user_id = auth.uid()
  ));

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_reviews;

-- =============================================================
-- PART 3: agent_knowledge — Semantic memory (facts, lessons)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.agent_knowledge (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE CASCADE,  -- NULL = team knowledge

  -- Scope & categorization
  scope text NOT NULL DEFAULT '/',   -- hierarchical: /project/X, /agent/Y, /team
  category text NOT NULL DEFAULT 'fact'
    CHECK (category IN ('fact', 'preference', 'strategy', 'lesson', 'decision')),

  -- Content
  content text NOT NULL,
  importance real DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),

  -- Source tracking
  source_task_id uuid REFERENCES public.agent_tasks_v2(id) ON DELETE SET NULL,
  source_type text,                  -- 'task_completion', 'user_input', 'consolidation', 'review'

  -- Temporal validity (Zep pattern)
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,           -- NULL = still valid

  -- Usage tracking (for decay)
  access_count integer DEFAULT 0,
  last_accessed_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_org_scope ON public.agent_knowledge (org_id, scope text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON public.agent_knowledge (agent_id, importance DESC)
  WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_valid ON public.agent_knowledge (org_id, valid_until)
  WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON public.agent_knowledge (org_id, category, importance DESC);

ALTER TABLE public.agent_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_knowledge"
  ON public.agent_knowledge FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Org members can view agent_knowledge"
  ON public.agent_knowledge FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_members.org_id = agent_knowledge.org_id
      AND organization_members.user_id = auth.uid()
  ));

-- =============================================================
-- PART 4: Extend agent_tasks_v2 with memory fields
-- =============================================================

-- Artifact references produced by this task
ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS artifact_ids uuid[] DEFAULT '{}';

-- Summary of parent task result (populated by trigger)
ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS parent_result_summary text;

-- Review tracking
ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS review_score numeric(3,2);

ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS review_iteration integer DEFAULT 0;

ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS max_review_iterations integer DEFAULT 3;

-- Context snapshot: what the agent should know when starting this task
ALTER TABLE public.agent_tasks_v2
  ADD COLUMN IF NOT EXISTS context_summary text;

-- =============================================================
-- PART 5: Improved dependency trigger — passes parent result
-- =============================================================

CREATE OR REPLACE FUNCTION public.resolve_task_dependencies()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_summary text;
BEGIN
  -- When a task is marked done, check if it unblocks other tasks
  IF NEW.status = 'done' AND OLD.status != 'done' THEN

    -- Build parent result summary
    parent_summary := NULL;
    IF NEW.result IS NOT NULL THEN
      parent_summary := COALESCE(
        NEW.result->>'summary',
        left(NEW.result::text, 500)
      );
    END IF;

    -- Unblock child tasks AND pass parent result context
    UPDATE public.agent_tasks_v2
    SET status = 'ready',
        parent_result_summary = COALESCE(
          parent_result_summary,
          format('[Tarea padre "%s" completada]: %s', NEW.title, COALESCE(parent_summary, 'Sin resumen'))
        ),
        context_summary = COALESCE(
          context_summary || E'\n',
          ''
        ) || format('Dependencia resuelta: "%s" → %s', NEW.title, COALESCE(parent_summary, 'Completada')),
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
          AND dep.id != NEW.id
      );
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger (DROP + CREATE for idempotency)
DROP TRIGGER IF EXISTS trg_resolve_dependencies ON public.agent_tasks_v2;
CREATE TRIGGER trg_resolve_dependencies
  AFTER UPDATE ON public.agent_tasks_v2
  FOR EACH ROW
  WHEN (NEW.status = 'done' AND OLD.status != 'done')
  EXECUTE FUNCTION public.resolve_task_dependencies();
