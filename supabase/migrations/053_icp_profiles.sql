-- ============================================================================
-- Migration 053: ICP Profiles — Org-level reusable ICP + Persona entities
-- ============================================================================
-- Moves ICP definitions and buyer personas from per-account-map to org-level.
-- Each ICP profile contains an ICP description + builder data + personas.
-- Account maps link to an ICP profile instead of defining ICP inline.
-- ============================================================================

-- =====================================================
-- 1. Create icp_profiles table
-- =====================================================
CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  builder_data JSONB NOT NULL DEFAULT '{}',
  discover_min_companies INT NOT NULL DEFAULT 5,
  discover_max_companies INT NOT NULL DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_icp_profiles_org_id ON public.icp_profiles(org_id);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view icp_profiles" ON public.icp_profiles
  FOR SELECT USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Org members can create icp_profiles" ON public.icp_profiles
  FOR INSERT WITH CHECK (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Org members can update icp_profiles" ON public.icp_profiles
  FOR UPDATE USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Managers can delete icp_profiles" ON public.icp_profiles
  FOR DELETE USING (org_id IN (SELECT public.user_manager_org_ids()));

CREATE TRIGGER update_icp_profiles_updated_at
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 2. Add icp_profile_id to account_maps
-- =====================================================
ALTER TABLE public.account_maps
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_account_maps_icp_profile_id ON public.account_maps(icp_profile_id);

-- =====================================================
-- 3. Add icp_profile_id to buyer_personas + make account_map_id nullable
-- =====================================================
ALTER TABLE public.buyer_personas
  ALTER COLUMN account_map_id DROP NOT NULL;

ALTER TABLE public.buyer_personas
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_buyer_personas_icp_profile_id ON public.buyer_personas(icp_profile_id);

-- =====================================================
-- 4. Data migration: create ICP profiles from existing account maps
-- =====================================================

-- Step 1: Create ICP profiles from account maps that have ICP data or personas
INSERT INTO public.icp_profiles (owner_id, org_id, name, description, builder_data, discover_min_companies, discover_max_companies)
SELECT DISTINCT ON (am.id)
  am.owner_id,
  am.org_id,
  am.name,
  am.icp_description,
  COALESCE(am.filters_json->'icp_builder_data', '{}'),
  am.discover_min_companies,
  am.discover_max_companies
FROM public.account_maps am
WHERE am.icp_description IS NOT NULL
   OR am.filters_json->'icp_builder_data' IS NOT NULL
   OR EXISTS (SELECT 1 FROM public.buyer_personas bp WHERE bp.account_map_id = am.id);

-- Step 2: Link account maps to their newly created ICP profiles (match by name + org)
UPDATE public.account_maps am
SET icp_profile_id = ip.id
FROM public.icp_profiles ip
WHERE ip.org_id = am.org_id
  AND ip.name = am.name
  AND am.icp_profile_id IS NULL;

-- Step 3: Link existing buyer_personas to their ICP profiles
UPDATE public.buyer_personas bp
SET icp_profile_id = am.icp_profile_id
FROM public.account_maps am
WHERE bp.account_map_id = am.id
  AND am.icp_profile_id IS NOT NULL
  AND bp.icp_profile_id IS NULL;
