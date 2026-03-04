-- ============================================================================
-- Migration 046: Company Research Projects
-- ============================================================================
-- Adds company research feature: users create research projects with custom
-- prompts, add companies (manually or via auto-trigger from Account Mapping),
-- and run exhaustive AI-powered research per company.
-- ============================================================================

-- ============================================================================
-- PART 1: Tables
-- ============================================================================

-- Research Projects — top-level containers with custom research prompts
CREATE TABLE IF NOT EXISTS public.research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  research_prompt TEXT NOT NULL,
  auto_trigger_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_trigger_account_map_ids UUID[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Research Project Companies — per-company research results within a project
CREATE TABLE IF NOT EXISTS public.research_project_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  research_project_id UUID NOT NULL REFERENCES public.research_projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.account_map_companies(id) ON DELETE SET NULL,
  -- Denormalized company info (survives if company is deleted from account map)
  company_name TEXT NOT NULL,
  company_website TEXT,
  company_industry TEXT,
  company_location TEXT,
  -- Research status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'researching', 'completed', 'failed')),
  -- Research results
  research_content TEXT,
  research_summary TEXT,
  research_sources JSONB DEFAULT '[]',
  research_metadata JSONB DEFAULT '{}',
  quality_score INT CHECK (quality_score IS NULL OR (quality_score >= 1 AND quality_score <= 10)),
  -- Error tracking
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_trigger', 'bulk_import')),
  -- Timestamps
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicates
  UNIQUE(research_project_id, company_id)
);

-- ============================================================================
-- PART 2: Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_research_projects_org_id
  ON public.research_projects(org_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_owner_id
  ON public.research_projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_research_projects_org_status
  ON public.research_projects(org_id, status);

CREATE INDEX IF NOT EXISTS idx_rpc_org_id
  ON public.research_project_companies(org_id);
CREATE INDEX IF NOT EXISTS idx_rpc_project_id
  ON public.research_project_companies(research_project_id);
CREATE INDEX IF NOT EXISTS idx_rpc_company_id
  ON public.research_project_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_rpc_status
  ON public.research_project_companies(status);
CREATE INDEX IF NOT EXISTS idx_rpc_pending_queue
  ON public.research_project_companies(org_id, status, queued_at)
  WHERE status = 'pending';

-- ============================================================================
-- PART 3: Triggers for updated_at
-- ============================================================================

CREATE TRIGGER update_research_projects_updated_at
  BEFORE UPDATE ON public.research_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_research_project_companies_updated_at
  BEFORE UPDATE ON public.research_project_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 4: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_project_companies ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: RLS Policies — research_projects (org-shared)
-- ============================================================================

CREATE POLICY "Org members can view research_projects"
  ON public.research_projects
  FOR SELECT USING (public.user_is_org_member(org_id));

CREATE POLICY "Org members can create research_projects"
  ON public.research_projects
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));

CREATE POLICY "Owner or manager can update research_projects"
  ON public.research_projects
  FOR UPDATE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

CREATE POLICY "Owner or manager can delete research_projects"
  ON public.research_projects
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

CREATE POLICY "Service role manages research_projects"
  ON public.research_projects
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 6: RLS Policies — research_project_companies (org-shared)
-- ============================================================================

CREATE POLICY "Org members can view research_project_companies"
  ON public.research_project_companies
  FOR SELECT USING (public.user_is_org_member(org_id));

CREATE POLICY "Org members can create research_project_companies"
  ON public.research_project_companies
  FOR INSERT WITH CHECK (public.user_is_org_member(org_id));

CREATE POLICY "Owner or manager can update research_project_companies"
  ON public.research_project_companies
  FOR UPDATE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

CREATE POLICY "Owner or manager can delete research_project_companies"
  ON public.research_project_companies
  FOR DELETE USING (
    public.user_is_org_member(org_id)
    AND (auth.uid() = owner_id OR public.user_has_org_role(org_id, 'manager'))
  );

CREATE POLICY "Service role manages research_project_companies"
  ON public.research_project_companies
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- PART 7: Auto-Trigger Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_queue_company_research()
RETURNS TRIGGER AS $$
DECLARE
  rp RECORD;
BEGIN
  FOR rp IN
    SELECT id, owner_id
    FROM public.research_projects
    WHERE org_id = NEW.org_id
      AND status = 'active'
      AND auto_trigger_enabled = true
      AND NEW.account_map_id = ANY(auto_trigger_account_map_ids)
  LOOP
    INSERT INTO public.research_project_companies (
      org_id, owner_id, research_project_id, company_id,
      company_name, company_website, company_industry, company_location,
      status, source
    ) VALUES (
      NEW.org_id, rp.owner_id, rp.id, NEW.id,
      NEW.company_name, NEW.website, NEW.industry, NEW.location,
      'pending', 'auto_trigger'
    )
    ON CONFLICT (research_project_id, company_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER auto_queue_company_for_research
  AFTER INSERT ON public.account_map_companies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_queue_company_research();
