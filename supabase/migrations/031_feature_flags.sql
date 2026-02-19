-- Add feature_flags JSONB column to organizations
-- Stores per-org feature toggles controlled by Super Admin
-- Default '{}' means all features ON (app merges with defaults)

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
