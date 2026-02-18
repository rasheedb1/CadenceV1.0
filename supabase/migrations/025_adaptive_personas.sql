-- =====================================================
-- ADAPTIVE BUYER PERSONAS + PROSPECT PERSONA TRACKING
-- =====================================================

-- 1. buyer_personas: adaptive fields for title keywords by company size tier
ALTER TABLE public.buyer_personas
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS role_in_buying_committee TEXT
    CHECK (role_in_buying_committee IN (
      'decision_maker', 'champion', 'influencer',
      'technical_evaluator', 'budget_holder', 'end_user'
    )),
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS departments TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS title_keywords_by_tier JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seniority_by_tier JSONB NOT NULL DEFAULT '{}';

-- 2. prospects: link to persona that found them + metadata
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS persona_id UUID REFERENCES public.buyer_personas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buying_role TEXT,
  ADD COLUMN IF NOT EXISTS search_metadata JSONB;

CREATE INDEX IF NOT EXISTS idx_prospects_persona_id ON public.prospects(persona_id);

-- 3. Data migration: copy existing flat title_keywords into all 3 tiers
UPDATE public.buyer_personas
SET
  title_keywords_by_tier = jsonb_build_object(
    'enterprise', to_jsonb(title_keywords),
    'mid_market', to_jsonb(title_keywords),
    'startup_smb', to_jsonb(title_keywords)
  ),
  seniority_by_tier = CASE
    WHEN seniority IS NOT NULL THEN jsonb_build_object(
      'enterprise', jsonb_build_array(seniority),
      'mid_market', jsonb_build_array(seniority),
      'startup_smb', jsonb_build_array(seniority)
    )
    ELSE '{}'::jsonb
  END
WHERE title_keywords_by_tier = '{}'::jsonb
  AND array_length(title_keywords, 1) > 0;
