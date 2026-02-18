-- =====================================================
-- ICP Description + Buyer Persona max_per_company
-- =====================================================

-- Add ICP description as a free-text prompt field
ALTER TABLE public.account_maps
  ADD COLUMN IF NOT EXISTS icp_description TEXT;

-- Add max prospects per company to buyer personas
ALTER TABLE public.buyer_personas
  ADD COLUMN IF NOT EXISTS max_per_company INTEGER NOT NULL DEFAULT 1;
