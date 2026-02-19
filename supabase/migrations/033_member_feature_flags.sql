-- Add per-user feature flags to organization_members
-- Allows Super Admin to override org-level flags for individual users
-- Empty '{}' means "inherit from org" (no user-level overrides)

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
