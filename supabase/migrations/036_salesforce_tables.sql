-- ============================================================================
-- Migration 036: Salesforce Integration Tables
-- ============================================================================
-- Three tables for Salesforce OAuth connections, cached accounts, and opportunities.
-- Uses existing RLS helper functions from migration 029.
-- ============================================================================

-- 1. Salesforce Connections (OAuth tokens per org)
CREATE TABLE IF NOT EXISTS public.salesforce_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  instance_url TEXT NOT NULL,

  -- Salesforce user info
  sf_user_id TEXT NOT NULL,
  sf_org_id TEXT,
  sf_username TEXT,

  -- Metadata
  token_issued_at TIMESTAMPTZ,
  connected_by UUID REFERENCES public.profiles(user_id),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,

  UNIQUE(org_id)
);

ALTER TABLE public.salesforce_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org salesforce connection"
  ON public.salesforce_connections FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Admins/managers can manage salesforce connection"
  ON public.salesforce_connections FOR ALL
  USING (org_id IN (SELECT public.user_manager_org_ids()));

CREATE INDEX idx_salesforce_connections_org_id ON public.salesforce_connections(org_id);

-- 2. Salesforce Accounts (cached)
CREATE TABLE IF NOT EXISTS public.salesforce_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  sf_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  industry TEXT,
  owner_name TEXT,

  -- Denormalized opportunity summary
  has_active_opportunities BOOLEAN DEFAULT FALSE,
  active_opportunities_count INTEGER DEFAULT 0,
  total_pipeline_value DECIMAL(15,2) DEFAULT 0,
  latest_opportunity_stage TEXT,
  latest_opportunity_name TEXT,
  latest_opportunity_close_date DATE,

  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, sf_account_id)
);

ALTER TABLE public.salesforce_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org salesforce accounts"
  ON public.salesforce_accounts FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

-- Service role handles inserts/updates/deletes during sync
CREATE POLICY "Service role can manage salesforce accounts"
  ON public.salesforce_accounts FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_sf_accounts_org_domain ON public.salesforce_accounts(org_id, domain);
CREATE INDEX idx_sf_accounts_org_name ON public.salesforce_accounts(org_id, lower(name));
CREATE INDEX idx_sf_accounts_has_opps ON public.salesforce_accounts(org_id, has_active_opportunities);

-- 3. Salesforce Opportunities (cached)
CREATE TABLE IF NOT EXISTS public.salesforce_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sf_account_id TEXT NOT NULL,

  sf_opportunity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  amount DECIMAL(15,2),
  currency_code TEXT DEFAULT 'USD',
  close_date DATE,
  probability INTEGER,
  is_closed BOOLEAN DEFAULT FALSE,
  is_won BOOLEAN DEFAULT FALSE,
  owner_name TEXT,

  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(org_id, sf_opportunity_id)
);

ALTER TABLE public.salesforce_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org salesforce opportunities"
  ON public.salesforce_opportunities FOR SELECT
  USING (org_id IN (SELECT public.user_org_ids()));

CREATE POLICY "Service role can manage salesforce opportunities"
  ON public.salesforce_opportunities FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_sf_opportunities_account ON public.salesforce_opportunities(org_id, sf_account_id);
CREATE INDEX idx_sf_opportunities_stage ON public.salesforce_opportunities(org_id, stage_name);
