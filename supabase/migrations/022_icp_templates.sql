-- =====================================================
-- ICP TEMPLATES + DISCOVERY FEEDBACK
-- =====================================================

-- =====================================================
-- 1. ICP TEMPLATES - reusable builder configurations
-- =====================================================
CREATE TABLE IF NOT EXISTS public.icp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  builder_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_icp_templates_owner_id ON public.icp_templates(owner_id);

ALTER TABLE public.icp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own icp templates" ON public.icp_templates
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own icp templates" ON public.icp_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own icp templates" ON public.icp_templates
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own icp templates" ON public.icp_templates
  FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER update_icp_templates_updated_at
  BEFORE UPDATE ON public.icp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. ICP DISCOVERY FEEDBACK - thumbs up/down on results
-- =====================================================
CREATE TABLE IF NOT EXISTS public.icp_discovery_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_map_id UUID NOT NULL REFERENCES public.account_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  feedback TEXT NOT NULL CHECK (feedback IN ('helpful', 'not_helpful')),
  discovery_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_map_id, company_name, owner_id)
);

CREATE INDEX idx_icp_discovery_feedback_map_id ON public.icp_discovery_feedback(account_map_id);
CREATE INDEX idx_icp_discovery_feedback_owner_id ON public.icp_discovery_feedback(owner_id);

ALTER TABLE public.icp_discovery_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own icp feedback" ON public.icp_discovery_feedback
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own icp feedback" ON public.icp_discovery_feedback
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own icp feedback" ON public.icp_discovery_feedback
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own icp feedback" ON public.icp_discovery_feedback
  FOR DELETE USING (auth.uid() = owner_id);
