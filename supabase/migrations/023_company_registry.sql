-- =====================================================
-- COMPANY REGISTRY - Central exclusion & prospection tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.company_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,

  -- Core company identity
  company_name TEXT NOT NULL,                 -- stored normalized (lowercase, trimmed, suffixes stripped)
  company_name_display TEXT NOT NULL,         -- original casing for display
  website TEXT,
  industry TEXT,
  company_size TEXT,
  location TEXT,

  -- Classification
  registry_type TEXT NOT NULL DEFAULT 'discovered'
    CHECK (registry_type IN ('customer', 'competitor', 'dnc', 'prospected', 'discovered')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('csv_import', 'manual', 'auto_prospected', 'discovery')),
  exclusion_reason TEXT,

  -- Prospection tracking
  prospected_at TIMESTAMPTZ,
  prospected_via TEXT CHECK (prospected_via IS NULL OR prospected_via IN ('linkedin_message', 'linkedin_connect', 'email')),

  -- Extensibility
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint: one entry per company per user (normalized name)
CREATE UNIQUE INDEX idx_company_registry_owner_name
  ON public.company_registry(owner_id, company_name);

-- Indexes for common queries
CREATE INDEX idx_company_registry_owner_id ON public.company_registry(owner_id);
CREATE INDEX idx_company_registry_type ON public.company_registry(owner_id, registry_type);
CREATE INDEX idx_company_registry_source ON public.company_registry(owner_id, source);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.company_registry ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES
-- =====================================================
CREATE POLICY "Users can view own registry entries" ON public.company_registry
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own registry entries" ON public.company_registry
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own registry entries" ON public.company_registry
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own registry entries" ON public.company_registry
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- TRIGGER for updated_at
-- =====================================================
CREATE TRIGGER update_company_registry_updated_at
  BEFORE UPDATE ON public.company_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
