-- =====================================================
-- ACCOUNT MAPPING - ICP, Companies, Personas, Prospects
-- =====================================================

-- =====================================================
-- 1. ACCOUNT MAPS - ICP definitions
-- =====================================================
CREATE TABLE IF NOT EXISTS public.account_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  filters_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. ACCOUNT MAP COMPANIES - target companies
-- =====================================================
CREATE TABLE IF NOT EXISTS public.account_map_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_map_id UUID NOT NULL REFERENCES public.account_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  industry TEXT,
  company_size TEXT,
  website TEXT,
  linkedin_url TEXT,
  location TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 3. BUYER PERSONAS - role definitions per account map
-- =====================================================
CREATE TABLE IF NOT EXISTS public.buyer_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_map_id UUID NOT NULL REFERENCES public.account_maps(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title_keywords TEXT[] NOT NULL DEFAULT '{}',
  seniority TEXT,
  department TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. PROSPECTS - found people (separate from leads)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_map_id UUID NOT NULL REFERENCES public.account_maps(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.account_map_companies(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  company TEXT,
  linkedin_url TEXT,
  linkedin_provider_id TEXT,
  headline TEXT,
  location TEXT,
  source TEXT DEFAULT 'sales_navigator',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'enriched', 'promoted')),
  enrichment_data JSONB,
  promoted_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_account_maps_owner_id ON public.account_maps(owner_id);

CREATE INDEX idx_account_map_companies_map_id ON public.account_map_companies(account_map_id);
CREATE INDEX idx_account_map_companies_owner_id ON public.account_map_companies(owner_id);

CREATE INDEX idx_buyer_personas_map_id ON public.buyer_personas(account_map_id);
CREATE INDEX idx_buyer_personas_owner_id ON public.buyer_personas(owner_id);

CREATE INDEX idx_prospects_map_id ON public.prospects(account_map_id);
CREATE INDEX idx_prospects_company_id ON public.prospects(company_id);
CREATE INDEX idx_prospects_owner_id ON public.prospects(owner_id);
CREATE INDEX idx_prospects_status ON public.prospects(status);
CREATE INDEX idx_prospects_linkedin_url ON public.prospects(linkedin_url);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.account_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_map_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- RLS POLICIES - Account Maps
-- =====================================================
CREATE POLICY "Users can view own account maps" ON public.account_maps
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own account maps" ON public.account_maps
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own account maps" ON public.account_maps
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own account maps" ON public.account_maps
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Account Map Companies
-- =====================================================
CREATE POLICY "Users can view own account map companies" ON public.account_map_companies
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own account map companies" ON public.account_map_companies
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own account map companies" ON public.account_map_companies
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own account map companies" ON public.account_map_companies
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Buyer Personas
-- =====================================================
CREATE POLICY "Users can view own buyer personas" ON public.buyer_personas
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own buyer personas" ON public.buyer_personas
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own buyer personas" ON public.buyer_personas
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own buyer personas" ON public.buyer_personas
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- RLS POLICIES - Prospects
-- =====================================================
CREATE POLICY "Users can view own prospects" ON public.prospects
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can create own prospects" ON public.prospects
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own prospects" ON public.prospects
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own prospects" ON public.prospects
  FOR DELETE USING (auth.uid() = owner_id);

-- =====================================================
-- TRIGGERS for updated_at
-- =====================================================
CREATE TRIGGER update_account_maps_updated_at
  BEFORE UPDATE ON public.account_maps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_account_map_companies_updated_at
  BEFORE UPDATE ON public.account_map_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_buyer_personas_updated_at
  BEFORE UPDATE ON public.buyer_personas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
