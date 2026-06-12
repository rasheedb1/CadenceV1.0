-- ============================================================================
-- Migration 137: account_map_companies — cached deck URLs
-- ============================================================================
-- The Chief Outreach 9-day cadence sends per-lead messages that reference
-- 2 distinct decks per COMPANY:
--   - ss_deck   (Stripe Sessions visual deck — Day 5 email_reply, Day 7 DM follow-up)
--   - sdr_bc    (SDR Business Case — Day 9 BC delivery)
--
-- Both decks are EXPENSIVE to generate (ss-deck ~5-45s, sdr-bc ~30s with
-- SimilarWeb + Firecrawl), so we cache them PER COMPANY. All leads from
-- the same company reuse the same URLs.
--
-- Generation is fire-and-forget on promote: by the time Day 5 fires
-- (5 business days later), URLs are guaranteed ready.
--
-- If a URL is NULL when a step fires (rare — only if generation failed
-- catastrophically), prompts skip the deck CTA — degrades silently.
-- ============================================================================

ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS ss_deck_url           TEXT,
  ADD COLUMN IF NOT EXISTS ss_deck_slug          TEXT,
  ADD COLUMN IF NOT EXISTS ss_deck_generated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sdr_bc_url            TEXT,
  ADD COLUMN IF NOT EXISTS sdr_bc_slug           TEXT,
  ADD COLUMN IF NOT EXISTS sdr_bc_generated_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_amc_ss_deck_slug ON public.account_map_companies (ss_deck_slug) WHERE ss_deck_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_amc_sdr_bc_slug  ON public.account_map_companies (sdr_bc_slug)  WHERE sdr_bc_slug  IS NOT NULL;

COMMENT ON COLUMN public.account_map_companies.ss_deck_url IS
  'Cached Stripe Sessions deck URL (chief.yuno.tools/m/<slug>). Generated on lead promote; reused across all leads from this company. NULL when generation pending or failed (prompt skips deck CTA).';
COMMENT ON COLUMN public.account_map_companies.sdr_bc_url IS
  'Cached SDR Business Case URL (chief.yuno.tools/sdr-bc/<slug>). Never expires. Generated on lead promote; reused across all leads from this company.';

DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM account_map_companies;
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 137 applied — % amc rows ready for deck caching', v_n;
END $$;
