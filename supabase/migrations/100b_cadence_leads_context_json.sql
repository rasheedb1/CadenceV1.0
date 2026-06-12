-- ============================================================================
-- Migration 100b: cadence_leads.context_json
-- ============================================================================
-- Agrega JSONB para metadata per-lead que la cadencia consume.
-- Uso inicial: bc_url cacheado por chief-generate-bc-for-company para que
-- el step Day 9 lea {{bc_url}} sin re-generar.
--
-- Ya aplicada en producción 2026-05-06 vía Management API. Este archivo
-- existe para idempotencia de re-deploys (db push detecta y skip-ea).
-- ============================================================================

ALTER TABLE public.cadence_leads
  ADD COLUMN IF NOT EXISTS context_json JSONB NOT NULL DEFAULT '{}'::jsonb;
