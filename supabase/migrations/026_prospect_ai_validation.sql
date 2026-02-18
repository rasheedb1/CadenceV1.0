-- Migration 026: Add AI validation fields to prospects for relevance scoring and outreach angles

-- AI validation columns on prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS relevance_score integer,
  ADD COLUMN IF NOT EXISTS role_fit text CHECK (role_fit IN ('strong', 'moderate', 'weak')),
  ADD COLUMN IF NOT EXISTS outreach_angle text,
  ADD COLUMN IF NOT EXISTS ai_reasoning text,
  ADD COLUMN IF NOT EXISTS red_flags text,
  ADD COLUMN IF NOT EXISTS ai_validated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_reason text;

-- Outreach strategies per company (cached per account_map + company)
CREATE TABLE IF NOT EXISTS outreach_strategies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_map_id uuid NOT NULL REFERENCES account_maps(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES account_map_companies(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy_name text,
  overall_reasoning text,
  steps jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (account_map_id, company_id, owner_id)
);

-- RLS
ALTER TABLE outreach_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own strategies"
  ON outreach_strategies FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users insert own strategies"
  ON outreach_strategies FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users update own strategies"
  ON outreach_strategies FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users delete own strategies"
  ON outreach_strategies FOR DELETE USING (auth.uid() = owner_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_strategies_map ON outreach_strategies(account_map_id);
CREATE INDEX IF NOT EXISTS idx_prospects_ai_validated ON prospects(ai_validated) WHERE ai_validated = true;

-- Trigger for updated_at
CREATE TRIGGER set_updated_at_outreach_strategies
  BEFORE UPDATE ON outreach_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
