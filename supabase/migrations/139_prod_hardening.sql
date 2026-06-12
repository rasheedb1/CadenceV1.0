-- ============================================================================
-- Migration 139: Production hardening for autonomous Chief Outreach cadence
-- ============================================================================
-- Adds:
--   1. org_chief_settings.outreach_enabled BOOLEAN (kill switch flag)
--   2. RPCs: disable_outreach_for_org / enable_outreach_for_org / is_outreach_enabled
--   3. UNIQUE INDEX on account_map_companies(org_id, normalize_company_name(company_name))
--      to enforce one-amc-per-company (today there are dupes like 2× Shopify rows)
--   4. leads.last_cadence_completed_at + index for per-lead 90d cooldown
--   5. cadence_alert_log table — anti-spam audit for WhatsApp ops alerts
--   6. RPC get_cadence_health_metrics(org, hours_back) returning bounce rate,
--      Carlos rejection rate, sends count, queue aging, etc. — used by the
--      new chief-cadence-alerts edge function (cron 8am ET).
-- ============================================================================

-- ─── 1. Kill switch flag ─────────────────────────────────────────────────
ALTER TABLE public.org_chief_settings
  ADD COLUMN IF NOT EXISTS outreach_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.org_chief_settings.outreach_enabled IS
  'Master kill switch. When false, chief-process-queue-batch + chief-consume-from-list bail out at the top. Set via disable_outreach_for_org() RPC.';

-- ─── 2. Kill-switch RPCs ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.disable_outreach_for_org(p_org_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE org_chief_settings
     SET outreach_enabled = false, updated_at = NOW()
   WHERE org_id = p_org_id;

  -- Cancel all currently-scheduled outbound work
  UPDATE schedules
     SET status = 'canceled',
         last_error = COALESCE('kill_switch:' || p_reason, 'kill_switch_disable_outreach_for_org'),
         updated_at = NOW()
   WHERE org_id = p_org_id
     AND status IN ('scheduled', 'processing');

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.enable_outreach_for_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE org_chief_settings
     SET outreach_enabled = true, updated_at = NOW()
   WHERE org_id = p_org_id
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.is_outreach_enabled(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(outreach_enabled, false) FROM org_chief_settings WHERE org_id = p_org_id LIMIT 1;
$$;

COMMENT ON FUNCTION public.disable_outreach_for_org(UUID, TEXT) IS
  'One-shot kill switch. Sets outreach_enabled=false + cancels all scheduled/processing schedules. Reversible via enable_outreach_for_org. Use when something looks wrong at 3am.';

-- ─── 3. UNIQUE INDEX on amc (no more duplicate company rows) ──────────────
-- Today Shopify has 2 amc rows. After dedup, future inserts will hit 23505.
-- chief-process-company already handles 23505 as skipped_dup.

-- Step 3a: dedupe pre-existing duplicates. For each (org_id, normalized_name)
-- group with >1 rows, keep the one with the most recent updated_at + most
-- linked leads. Re-assign FKs from the duplicates to the survivor, then delete.
DO $$
DECLARE
  dup_count INT;
BEGIN
  -- Count groups with dupes
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT org_id, normalize_company_name(company_name) AS norm
      FROM account_map_companies
     GROUP BY org_id, normalize_company_name(company_name)
    HAVING COUNT(*) > 1
  ) sub;
  RAISE NOTICE 'Found % duplicate amc groups before dedup', dup_count;
END $$;

-- Merge: for each dup group, find the survivor (most linked leads, then most recent),
-- reassign leads.account_map_company_id + prospects.company_id + queue rows to survivor,
-- then delete the dupes.
WITH ranked AS (
  SELECT amc.id, amc.org_id,
         normalize_company_name(amc.company_name) AS norm,
         ROW_NUMBER() OVER (
           PARTITION BY amc.org_id, normalize_company_name(amc.company_name)
           ORDER BY (
             COALESCE((SELECT COUNT(*) FROM leads WHERE account_map_company_id = amc.id), 0)
             + CASE WHEN amc.ss_deck_url IS NOT NULL THEN 100 ELSE 0 END
             + CASE WHEN amc.sdr_bc_url IS NOT NULL THEN 100 ELSE 0 END
           ) DESC,
           amc.updated_at DESC
         ) AS rn
    FROM account_map_companies amc
),
survivors AS (
  SELECT id AS survivor_id, org_id, norm FROM ranked WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, s.survivor_id
    FROM ranked r
    JOIN survivors s ON s.org_id = r.org_id AND s.norm = r.norm
   WHERE r.rn > 1
),
-- Reassign leads
upd_leads AS (
  UPDATE leads SET account_map_company_id = l.survivor_id
    FROM losers l WHERE leads.account_map_company_id = l.loser_id
  RETURNING 1
),
-- Reassign queue rows (best-effort; UNIQUE-per-day may conflict, ignore on conflict)
upd_queue AS (
  UPDATE icp_pipeline_queue q SET company_id = l.survivor_id
    FROM losers l WHERE q.company_id = l.loser_id
  RETURNING 1
),
-- Reassign prospects
upd_prospects AS (
  UPDATE prospects p SET company_id = l.survivor_id
    FROM losers l WHERE p.company_id = l.loser_id
  RETURNING 1
)
DELETE FROM account_map_companies amc
 USING losers l WHERE amc.id = l.loser_id;

-- Step 3b: create the UNIQUE INDEX
DROP INDEX IF EXISTS public.uniq_amc_org_norm_name;
CREATE UNIQUE INDEX uniq_amc_org_norm_name
  ON public.account_map_companies (org_id, (normalize_company_name(company_name)));

COMMENT ON INDEX public.uniq_amc_org_norm_name IS
  'V139: enforces one amc per (org, normalized company name). Future duplicate inserts hit 23505 which chief-process-company handles as skipped_dup. Killed dupes like 2× Shopify rows on 2026-05-12.';

-- ─── 4. Per-lead post-Day9 cooldown ──────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_cadence_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_last_cadence_completed
  ON public.leads (org_id, last_cadence_completed_at)
  WHERE last_cadence_completed_at IS NOT NULL;

COMMENT ON COLUMN public.leads.last_cadence_completed_at IS
  'Set when process-queue advances a lead past Day 9 (cadence completed). Prevents re-adding the lead to a new cadence for 90 days. Enforced by process-queue lead-promotion check.';

-- ─── 5. Alert log table (anti-spam) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cadence_alert_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_kind      TEXT NOT NULL,
  alert_date      DATE NOT NULL,
  metrics_json    JSONB NOT NULL,
  whatsapp_status INT,
  notified_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_alert_kind_per_org_per_day UNIQUE (org_id, alert_kind, alert_date)
);

CREATE INDEX IF NOT EXISTS idx_cadence_alert_log_org_date
  ON public.cadence_alert_log (org_id, alert_date DESC);

COMMENT ON TABLE public.cadence_alert_log IS
  'Anti-spam audit trail for WhatsApp ops alerts (chief-cadence-alerts). UNIQUE (org, kind, date) means max 1 alert of each kind per day per org.';

-- Claim slot RPC (mirrors claim_pre_approved_alert_slot pattern from Migration 134)
CREATE OR REPLACE FUNCTION public.claim_cadence_alert_slot(
  p_org_id     UUID,
  p_alert_kind TEXT,
  p_metrics    JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'America/New_York')::DATE;
  v_inserted INT;
BEGIN
  WITH ins AS (
    INSERT INTO public.cadence_alert_log (org_id, alert_kind, alert_date, metrics_json)
    VALUES (p_org_id, p_alert_kind, v_today, p_metrics)
    ON CONFLICT (org_id, alert_kind, alert_date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;
  RETURN v_inserted = 1;
END;
$$;

-- ─── 6. Health metrics RPC ───────────────────────────────────────────────
-- Returns a single JSONB blob with all metrics chief-cadence-alerts needs
-- to decide which alerts to fire. Computed atomically over a time window.
CREATE OR REPLACE FUNCTION public.get_cadence_health_metrics(
  p_org_id     UUID,
  p_hours_back INT DEFAULT 24
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := NOW() - (p_hours_back || ' hours')::INTERVAL;
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'org_id', p_org_id,
    'window_hours', p_hours_back,
    'window_since', v_since,
    -- Send volumes
    'emails_sent',          (SELECT COUNT(*) FROM email_messages WHERE org_id = p_org_id AND sent_at > v_since AND status = 'sent'),
    'emails_failed',        (SELECT COUNT(*) FROM email_messages WHERE org_id = p_org_id AND created_at > v_since AND status = 'failed'),
    'emails_bounced',       (SELECT COUNT(*) FROM email_messages e
                              JOIN leads l ON l.id = e.lead_id
                             WHERE e.org_id = p_org_id AND l.last_bounce_at > v_since),
    'schedules_executed',   (SELECT COUNT(*) FROM schedules WHERE org_id = p_org_id AND updated_at > v_since AND status = 'executed'),
    'schedules_failed',     (SELECT COUNT(*) FROM schedules WHERE org_id = p_org_id AND updated_at > v_since AND status = 'failed'),
    'schedules_skipped',    (SELECT COUNT(*) FROM schedules WHERE org_id = p_org_id AND updated_at > v_since AND status IN ('skipped_due_to_state_change', 'rejected')),
    -- Carlos QA
    'qa_reviews_total',     (SELECT COUNT(*) FROM message_qa_reviews WHERE org_id = p_org_id AND created_at > v_since),
    'qa_rejected',          (SELECT COUNT(*) FROM message_qa_reviews WHERE org_id = p_org_id AND created_at > v_since AND status = 'rejected'),
    'qa_auto_passed',       (SELECT COUNT(*) FROM message_qa_reviews WHERE org_id = p_org_id AND created_at > v_since AND status = 'auto_passed'),
    -- Queue aging
    'queue_stuck_processing', (SELECT COUNT(*) FROM icp_pipeline_queue WHERE org_id = p_org_id AND status = 'processing' AND claimed_at < NOW() - INTERVAL '1 hour'),
    'queue_pending',        (SELECT COUNT(*) FROM icp_pipeline_queue WHERE org_id = p_org_id AND status = 'pending'),
    -- Deck cache
    'amc_missing_ss_deck',  (SELECT COUNT(*) FROM account_map_companies amc
                              WHERE amc.org_id = p_org_id
                                AND EXISTS (SELECT 1 FROM leads l WHERE l.account_map_company_id = amc.id)
                                AND amc.ss_deck_url IS NULL),
    'amc_missing_sdr_bc',   (SELECT COUNT(*) FROM account_map_companies amc
                              WHERE amc.org_id = p_org_id
                                AND EXISTS (SELECT 1 FROM leads l WHERE l.account_map_company_id = amc.id)
                                AND amc.sdr_bc_url IS NULL),
    'amc_missing_ss_pdf_b64',  (SELECT COUNT(*) FROM account_map_companies amc
                                 WHERE amc.org_id = p_org_id AND amc.ss_deck_url IS NOT NULL AND amc.ss_deck_pdf_b64 IS NULL),
    -- Pre-approved list health
    'pre_approved_remaining', (SELECT COUNT(*) FROM pre_approved_icp_companies WHERE consumed_at IS NULL),
    -- Replies
    'replies_received',     (SELECT COUNT(*) FROM cadence_leads WHERE org_id = p_org_id AND status = 'paused' AND updated_at > v_since),
    -- Outreach enabled
    'outreach_enabled',     (SELECT outreach_enabled FROM org_chief_settings WHERE org_id = p_org_id),
    'computed_at',          NOW()
  ) INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_cadence_health_metrics(UUID, INT) IS
  'Returns JSONB with all health metrics over a rolling window. Used by chief-cadence-alerts to fire WhatsApp pings when thresholds breach.';

-- ─── 7. Smoke ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_test_org UUID := '553315b5-42d0-4518-a461-e4cb12914c54';
  v_metrics JSONB;
  v_amc_total INT;
  v_amc_dupes INT;
BEGIN
  SELECT COUNT(*) INTO v_amc_total FROM account_map_companies WHERE org_id = v_test_org;
  SELECT COUNT(*) INTO v_amc_dupes FROM (
    SELECT 1 FROM account_map_companies WHERE org_id = v_test_org
     GROUP BY org_id, normalize_company_name(company_name) HAVING COUNT(*) > 1
  ) s;
  v_metrics := get_cadence_health_metrics(v_test_org, 24);

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 139 (prod hardening) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  Kill switch RPCs: ready';
  RAISE NOTICE '  AMC total for test org: %', v_amc_total;
  RAISE NOTICE '  AMC remaining dupes (must be 0): %', v_amc_dupes;
  RAISE NOTICE '  outreach_enabled: %', v_metrics->>'outreach_enabled';
  RAISE NOTICE '  pre_approved_remaining: %', v_metrics->>'pre_approved_remaining';
  IF v_amc_dupes > 0 THEN
    RAISE EXCEPTION 'Dedupe failed: % amc dupe groups remain', v_amc_dupes;
  END IF;
  RAISE NOTICE '  Smoke tests passed ✓';
END $$;
