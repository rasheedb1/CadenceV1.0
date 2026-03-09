-- ============================================================================
-- Migration 064: User-Level Isolation for ICP Profiles + Fix buyer_personas
-- ============================================================================
-- Problem 1: icp_profiles used "Org members can view icp_profiles" policy,
-- allowing all users in the same org to see each other's ICP profiles.
--
-- Problem 2: Migration 063 set buyer_personas linked to icp_profile_id as
-- org-wide visible. Now that ICP profiles are user-private, their personas
-- must also be user-private.
-- ============================================================================

-- ============================================================================
-- PART 1: icp_profiles — user-level isolation
-- ============================================================================

DROP POLICY IF EXISTS "Org members can view icp_profiles" ON public.icp_profiles;

CREATE POLICY "Users can view own icp_profiles" ON public.icp_profiles
  FOR SELECT USING (
    auth.uid() = owner_id
    AND public.user_is_org_member(org_id)
  );

-- ============================================================================
-- PART 2: buyer_personas — simplify to owner-only (covers both account_map
-- and icp_profile linked personas, since both are now user-private)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own buyer personas" ON public.buyer_personas;

CREATE POLICY "Users can view own buyer personas" ON public.buyer_personas
  FOR SELECT USING (
    auth.uid() = owner_id
    AND public.user_is_org_member(org_id)
  );
