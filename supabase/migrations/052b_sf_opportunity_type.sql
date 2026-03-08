-- Migration 052: Add opportunity_type to salesforce_opportunities
-- Allows filtering by Salesforce Opportunity Type field (e.g. "New Customer" vs "Partner")

ALTER TABLE public.salesforce_opportunities
  ADD COLUMN IF NOT EXISTS opportunity_type TEXT;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_sf_opps_type
  ON public.salesforce_opportunities(org_id, opportunity_type)
  WHERE opportunity_type IS NOT NULL;
