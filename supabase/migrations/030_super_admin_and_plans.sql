-- ============================================================================
-- Migration 030: Super-Admin + Organization Plans
-- ============================================================================

-- Add plan and status to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Add super-admin flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark Rasheed as super-admin
UPDATE public.profiles SET is_super_admin = TRUE
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'rasheedbayter@gmail.com' LIMIT 1);

-- ============================================================================
-- RLS: Super-admin policies
-- ============================================================================

-- Helper function: check if current user is super-admin (bypasses RLS via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.profiles WHERE user_id = auth.uid()),
    FALSE
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Organizations: super-admins can do everything
CREATE POLICY "Super admins full access to organizations"
  ON public.organizations FOR ALL
  USING (public.is_super_admin());

-- Organization members: super-admins can do everything
CREATE POLICY "Super admins full access to org members"
  ON public.organization_members FOR ALL
  USING (public.is_super_admin());

-- Organization invitations: super-admins can do everything
CREATE POLICY "Super admins full access to org invitations"
  ON public.organization_invitations FOR ALL
  USING (public.is_super_admin());
