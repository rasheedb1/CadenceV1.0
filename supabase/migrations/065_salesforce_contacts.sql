-- ============================================================================
-- Migration 065: Salesforce Contacts Table
-- ============================================================================
-- Stores contacts from Salesforce accounts with active opportunities.
-- Used during cascade-search-company to filter out prospects who are already
-- contacts in an open Salesforce opportunity (to avoid outreach to active deals).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salesforce_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  sf_account_id TEXT NOT NULL,
  sf_contact_id TEXT NOT NULL,

  name TEXT NOT NULL,
  -- Lowercase, punctuation-stripped version for fuzzy name matching
  name_normalized TEXT NOT NULL,

  email TEXT,
  title TEXT,

  -- Denormalized from parent account: true if account has at least one open opportunity
  has_active_opportunity BOOLEAN DEFAULT FALSE,

  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, sf_contact_id)
);

ALTER TABLE public.salesforce_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org salesforce contacts"
  ON public.salesforce_contacts FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Service role can manage salesforce contacts"
  ON public.salesforce_contacts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Primary lookup index: filter by org + active opportunity flag during cascade search
CREATE INDEX idx_sf_contacts_org_active ON public.salesforce_contacts(org_id, has_active_opportunity);
-- Secondary index for email-based matching (post-enrichment use cases)
CREATE INDEX idx_sf_contacts_org_email ON public.salesforce_contacts(org_id, email) WHERE email IS NOT NULL;
