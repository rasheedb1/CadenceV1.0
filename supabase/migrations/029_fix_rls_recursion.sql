-- ============================================================================
-- Migration 029: Fix infinite recursion in organization_members RLS policies
-- ============================================================================
-- The organization_members policies used subqueries on organization_members
-- itself, causing infinite recursion. Fix: use SECURITY DEFINER helper
-- functions that bypass RLS.
-- ============================================================================

-- Helper: get all org_ids the current user belongs to (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM public.organization_members WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get org_ids where user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_admin_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM public.organization_members
  WHERE user_id = auth.uid() AND role = 'admin';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: get org_ids where user is admin or manager (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_manager_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM public.organization_members
  WHERE user_id = auth.uid() AND role IN ('admin', 'manager');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- Drop old recursive policies on organization_members
-- ============================================================================
DROP POLICY IF EXISTS "Members can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins and managers can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can remove members or self-remove" ON public.organization_members;

-- ============================================================================
-- Recreate with non-recursive helper functions
-- ============================================================================
CREATE POLICY "Members can view org members" ON public.organization_members
  FOR SELECT USING (
    org_id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "Admins and managers can add members" ON public.organization_members
  FOR INSERT WITH CHECK (
    org_id IN (SELECT public.user_manager_org_ids())
    OR user_id = auth.uid()  -- self-join (e.g. creating org adds yourself)
  );

CREATE POLICY "Admins can update members" ON public.organization_members
  FOR UPDATE USING (
    org_id IN (SELECT public.user_admin_org_ids())
  );

CREATE POLICY "Admins can remove members or self-remove" ON public.organization_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR org_id IN (SELECT public.user_admin_org_ids())
  );

-- ============================================================================
-- Also fix organizations table policies (same recursion issue)
-- ============================================================================
DROP POLICY IF EXISTS "Members can view own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update own org" ON public.organizations;
DROP POLICY IF EXISTS "Admins can delete own org" ON public.organizations;

CREATE POLICY "Members can view own org" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT public.user_org_ids())
  );

CREATE POLICY "Admins can update own org" ON public.organizations
  FOR UPDATE USING (
    id IN (SELECT public.user_admin_org_ids())
  );

CREATE POLICY "Admins can delete own org" ON public.organizations
  FOR DELETE USING (
    id IN (SELECT public.user_admin_org_ids())
  );

-- ============================================================================
-- Fix organization_invitations policies too
-- ============================================================================
DROP POLICY IF EXISTS "Members can view org invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Admins and managers can create invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Admins can update invitations" ON public.organization_invitations;

CREATE POLICY "Members can view org invitations" ON public.organization_invitations
  FOR SELECT USING (
    org_id IN (SELECT public.user_org_ids())
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "Admins and managers can create invitations" ON public.organization_invitations
  FOR INSERT WITH CHECK (
    org_id IN (SELECT public.user_manager_org_ids())
  );

CREATE POLICY "Admins can update invitations" ON public.organization_invitations
  FOR UPDATE USING (
    org_id IN (SELECT public.user_admin_org_ids())
  );
