-- ============================================================
-- 061 — User job role + Salesforce owner name
-- ============================================================
-- Adds:
--   profiles.job_role     — 'sdr' | 'bdm' (BDM = AE)
--   profiles.sf_owner_name — Salesforce Opportunity Owner name to match against
--   salesforce_accounts.opp_owner_name — denormalized latest opp owner (stored during sync)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_role TEXT CHECK (job_role IN ('sdr', 'bdm')),
  ADD COLUMN IF NOT EXISTS sf_owner_name TEXT;

ALTER TABLE public.salesforce_accounts
  ADD COLUMN IF NOT EXISTS opp_owner_name TEXT;

-- Index for fast AE dashboard filtering by owner
CREATE INDEX IF NOT EXISTS idx_sf_accounts_opp_owner
  ON public.salesforce_accounts (org_id, opp_owner_name);
