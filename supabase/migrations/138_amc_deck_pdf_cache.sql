-- ============================================================================
-- Migration 138: cache pre-encoded PDF base64 on account_map_companies
-- ============================================================================
-- send-email's attachDeck flag previously called the bridge at send time:
--   1. bridge renders Puppeteer PDF (~15s)
--   2. ghostscript compresses (~10s)
--   3. send-email fetches the PDF (~40s wall time)
--   4. send-email base64-encodes (CPU)
--   5. send-email builds multipart + POSTs to Gmail
--
-- Total wall time on Supabase edge function: 40-60s + CPU spikes for
-- encoding. Hits WORKER_RESOURCE_LIMIT even for 5MB PDFs.
--
-- Fix: move the heavy work (bridge fetch + base64 encode) to the bridge
-- itself (full Node.js, no Supabase limit), called once during deck
-- generation in chief-prepare-decks-for-company. Store the resulting
-- base64 string on amc. send-email just reads + wraps + sends → fast,
-- low memory.
--
-- Postgres TEXT columns toast-compress on disk automatically; 5-8MB
-- base64 strings are fine.
-- ============================================================================

ALTER TABLE public.account_map_companies
  ADD COLUMN IF NOT EXISTS ss_deck_pdf_b64           TEXT,
  ADD COLUMN IF NOT EXISTS ss_deck_pdf_size_bytes    INT,
  ADD COLUMN IF NOT EXISTS ss_deck_pdf_cached_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sdr_bc_pdf_b64            TEXT,
  ADD COLUMN IF NOT EXISTS sdr_bc_pdf_size_bytes     INT,
  ADD COLUMN IF NOT EXISTS sdr_bc_pdf_cached_at      TIMESTAMPTZ;

COMMENT ON COLUMN public.account_map_companies.ss_deck_pdf_b64 IS
  'Pre-encoded base64 string of the gs-compressed ss-deck PDF. Populated by chief-prepare-decks-for-company via bridge.yuno.tools/api/m/<slug>/pdf-b64. send-email reads this directly at send time to avoid the ~40s bridge fetch + CPU-heavy base64 encode that triggered WORKER_RESOURCE_LIMIT.';
COMMENT ON COLUMN public.account_map_companies.sdr_bc_pdf_b64 IS
  'Pre-encoded base64 string of the gs-compressed sdr-bc PDF. Same flow as ss_deck_pdf_b64.';

DO $$
DECLARE v_n INT;
BEGIN
  SELECT COUNT(*) INTO v_n FROM account_map_companies;
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 138 applied — % amc rows ready for PDF b64 cache', v_n;
END $$;
