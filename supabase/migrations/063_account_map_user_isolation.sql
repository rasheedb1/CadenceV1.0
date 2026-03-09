-- ============================================================================
-- Migration 063: User-Level Isolation for Account Maps
-- ============================================================================
-- Problem: account_maps, account_map_companies, prospects, and buyer_personas
-- were using "Org members can view ..." policies (from migration 027), which
-- allowed ALL users in the same org to see each other's account maps.
--
-- Fix: Replace org-wide SELECT policies with user-scoped policies so each
-- user only sees their own account maps and related data.
-- Exception: buyer_personas linked to icp_profiles remain org-visible
-- (they are shared ICP template personas, not personal data).
-- ============================================================================

-- ============================================================================
-- PART 1: account_maps
-- ============================================================================

-- Drop org-wide policy (allows all org members to see all maps)
DROP POLICY IF EXISTS "Org members can view account_maps" ON public.account_maps;
-- Drop old owner-only policy (will recreate with org membership check)
DROP POLICY IF EXISTS "Users can view own account maps" ON public.account_maps;

-- Only the owner (within the org) can see their own account maps
CREATE POLICY "Users can view own account maps" ON public.account_maps
  FOR SELECT USING (
    auth.uid() = owner_id
    AND public.user_is_org_member(org_id)
  );

-- ============================================================================
-- PART 2: account_map_companies
-- ============================================================================

DROP POLICY IF EXISTS "Org members can view account_map_companies" ON public.account_map_companies;
DROP POLICY IF EXISTS "Users can view own account map companies" ON public.account_map_companies;

CREATE POLICY "Users can view own account map companies" ON public.account_map_companies
  FOR SELECT USING (
    auth.uid() = owner_id
    AND public.user_is_org_member(org_id)
  );

-- ============================================================================
-- PART 3: prospects
-- ============================================================================

DROP POLICY IF EXISTS "Org members can view prospects" ON public.prospects;
DROP POLICY IF EXISTS "Users can view own prospects" ON public.prospects;

CREATE POLICY "Users can view own prospects" ON public.prospects
  FOR SELECT USING (
    auth.uid() = owner_id
    AND public.user_is_org_member(org_id)
  );

-- ============================================================================
-- PART 4: buyer_personas (two cases)
-- ============================================================================

DROP POLICY IF EXISTS "Org members can view buyer_personas" ON public.buyer_personas;
DROP POLICY IF EXISTS "Users can view own buyer personas" ON public.buyer_personas;

-- buyer_personas linked to account_map → user-private
-- buyer_personas linked to icp_profile → org-visible (shared templates)
CREATE POLICY "Users can view own buyer personas" ON public.buyer_personas
  FOR SELECT USING (
    -- Account-map personas: only the owner sees them
    (account_map_id IS NOT NULL AND auth.uid() = owner_id AND public.user_is_org_member(org_id))
    OR
    -- ICP profile personas: all org members can see (org-level research templates)
    (icp_profile_id IS NOT NULL AND public.user_is_org_member(org_id))
  );
