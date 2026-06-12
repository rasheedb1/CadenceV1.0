-- ============================================================================
-- Migration 121: Deep research schema (intelligence-driven messaging)
-- ============================================================================
-- Adapted from Yuno's internal "SDR Research Brief v5.0" framework.
-- Enriches account_map_companies.research_json with structured intelligence
-- that drives outreach messaging (cross-border, APM gaps, payment stack, etc).
--
-- Schema additions to research_json:
--   • intelligence: {
--       top_markets: [{country, traffic_share_estimate, source_url}]  // top 3-5
--       legal_entities: [{country, has_entity, source_url}]
--       cross_border_opportunities: [{country, missing_entity, opportunity_score, why}]
--       apm_gaps: [{country, missing_apms: [pix, oxxo, etc], opportunity_score}]
--       payment_stack: {
--         psps_detected: [{name, evidence_type, source_url}],
--         orchestrator_detected: bool,
--         gateway_evidence: [...]
--       }
--       payment_complaints: [{issue_type, source_url, frequency_estimate}]
--       expansion_signals: [{date, type, description, source_url}]
--       funding_signals: [{date, amount, round, source_url}]
--       psp_changes: [{date, type: added|removed, psp_name, source_url}]
--     }
--   • intelligence_synthesized_at: ISO timestamp
--   • intelligence_synthesis_cost_usd: float
-- ============================================================================

-- The research_json column is JSONB and accepts these additions without DDL.
-- This migration only documents the schema + adds an index for fast lookups.

-- =====================================================
-- 1. Add columns for intelligence freshness tracking
-- =====================================================
ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS intelligence_synthesized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS intelligence_synthesis_cost_usd NUMERIC(10,4);

CREATE INDEX IF NOT EXISTS idx_amc_intelligence_synthesized
  ON public.account_map_companies (org_id, intelligence_synthesized_at)
  WHERE intelligence_synthesized_at IS NOT NULL;

COMMENT ON COLUMN public.account_map_companies.intelligence_synthesized_at IS
  'When chief-deep-research-company last synthesized structured intelligence (TTL 30d). NULL = needs deep research.';

-- =====================================================
-- 2. Schema documentation (in COMMENT)
-- =====================================================
COMMENT ON COLUMN public.account_map_companies.research_json IS
  $DOC$Cached company research with optional deep intelligence layer:
{
  "version": 2,
  "company_insights": [...],     // basic firecrawl results (existing)
  "detected_signals": [...],     // signal scan results (existing)
  "fetched_at": ISO,
  "signals_refreshed_at": ISO,
  "intelligence": {              // NEW: deep research from migration 121
    "top_markets": [
      {"country": "Brazil", "traffic_share_estimate": "32%", "source_url": "https://similarweb.com/..."},
      {"country": "Mexico", "traffic_share_estimate": "18%", "source_url": "..."}
    ],
    "legal_entities": [
      {"country": "USA", "has_entity": true, "source_url": "..."},
      {"country": "Brazil", "has_entity": false, "source_url": "..."}
    ],
    "cross_border_opportunities": [
      {"country": "Brazil", "missing_entity": true, "opportunity_score": "high",
       "why": "32% traffic but no Brazilian entity = cross-border processing = ~3-5pt approval gap + higher MDR"}
    ],
    "apm_gaps": [
      {"country": "Brazil", "missing_apms": ["PIX", "Boleto"], "opportunity_score": "high"},
      {"country": "Mexico", "missing_apms": ["OXXO", "SPEI"], "opportunity_score": "medium"}
    ],
    "payment_stack": {
      "psps_detected": [
        {"name": "Stripe", "evidence_type": "checkout_source", "source_url": "..."},
        {"name": "Adyen", "evidence_type": "job_listing", "source_url": "..."}
      ],
      "orchestrator_detected": false,
      "gateway_evidence": []
    },
    "payment_complaints": [
      {"issue_type": "declined_card_brazil", "source_url": "https://reddit.com/...", "frequency_estimate": "moderate"}
    ],
    "expansion_signals": [
      {"date": "2026-04-01", "type": "new_market", "description": "Launched in Colombia",
       "source_url": "..."}
    ],
    "funding_signals": [...],
    "psp_changes": [...],
    "executive_summary": "3-4 sentence summary used as primary message hook"
  }
}$DOC$;

-- =====================================================
-- 3. Resumen
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 121 (deep research schema) applied:';
  RAISE NOTICE '  - account_map_companies + intelligence_synthesized_at + intelligence_synthesis_cost_usd';
  RAISE NOTICE '  - research_json schema documented (intelligence layer with cross-border/APM-gaps/PSP-stack)';
  RAISE NOTICE '  - chief-deep-research-company will populate intelligence (TTL 30d)';
END $$;
