-- ============================================================================
-- Fix 1: RLS policies on organization_invitations
-- Replace `SELECT email FROM auth.users WHERE id = auth.uid()` with
-- `auth.jwt() ->> 'email'` to avoid permission errors on auth.users table
-- ============================================================================

-- Drop the problematic policies
DROP POLICY IF EXISTS "Members can view org invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Admins managers or invitees can update invitations" ON public.organization_invitations;

-- Recreate with auth.jwt() instead of auth.users subquery
CREATE POLICY "Members can view org invitations" ON public.organization_invitations
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM public.organization_members om WHERE om.user_id = auth.uid())
    OR email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "Admins managers or invitees can update invitations" ON public.organization_invitations
  FOR UPDATE USING (
    org_id IN (
      SELECT om.org_id FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('admin', 'manager')
    )
    OR email = (auth.jwt() ->> 'email')
  );

-- ============================================================================
-- Fix 2: Add FK from organization_members.user_id to profiles.user_id
-- This enables PostgREST joins like .select('... profiles(full_name)')
-- ============================================================================

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Grant SELECT on auth.users to authenticated role for any remaining needs
-- (This is a safety net but the RLS fix above is the primary solution)
