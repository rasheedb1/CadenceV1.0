-- ============================================================================
-- Migration 140: Observability views for autonomous Chief Outreach prod
-- ============================================================================

-- 1. cadence_funnel_daily — companies → leads → sends → replies per day
CREATE OR REPLACE VIEW public.cadence_funnel_daily AS
WITH days AS (
  SELECT generate_series((NOW() - INTERVAL '30 days')::DATE, NOW()::DATE, '1 day'::INTERVAL)::DATE AS day
),
orgs AS (
  SELECT DISTINCT org_id FROM org_chief_settings
)
SELECT
  d.day,
  o.org_id,
  -- Discovery layer
  (SELECT COUNT(*) FROM icp_pipeline_queue q WHERE q.org_id = o.org_id AND DATE(q.created_at AT TIME ZONE 'America/New_York') = d.day) AS companies_enqueued,
  (SELECT COUNT(*) FROM icp_pipeline_queue q WHERE q.org_id = o.org_id AND DATE(q.processed_at AT TIME ZONE 'America/New_York') = d.day AND q.status = 'done') AS companies_processed,
  (SELECT COUNT(*) FROM icp_pipeline_queue q WHERE q.org_id = o.org_id AND DATE(q.processed_at AT TIME ZONE 'America/New_York') = d.day AND q.status IN ('failed', 'skipped')) AS companies_skipped_or_failed,
  -- Lead promotion
  (SELECT COUNT(*) FROM leads l WHERE l.org_id = o.org_id AND DATE(l.created_at AT TIME ZONE 'America/New_York') = d.day) AS leads_created,
  -- Sends
  (SELECT COUNT(*) FROM email_messages e WHERE e.org_id = o.org_id AND DATE(e.sent_at AT TIME ZONE 'America/New_York') = d.day AND e.status = 'sent') AS emails_sent,
  (SELECT COUNT(*) FROM activity_log al WHERE al.org_id = o.org_id AND DATE(al.created_at AT TIME ZONE 'America/New_York') = d.day AND al.action = 'send_linkedin_invite' AND al.status = 'success') AS li_invites_sent,
  (SELECT COUNT(*) FROM activity_log al WHERE al.org_id = o.org_id AND DATE(al.created_at AT TIME ZONE 'America/New_York') = d.day AND al.action = 'send_linkedin_dm' AND al.status = 'success') AS li_dms_sent,
  -- QA
  (SELECT COUNT(*) FROM message_qa_reviews qa WHERE qa.org_id = o.org_id AND DATE(qa.created_at AT TIME ZONE 'America/New_York') = d.day AND qa.status = 'rejected') AS qa_rejected,
  (SELECT COUNT(*) FROM message_qa_reviews qa WHERE qa.org_id = o.org_id AND DATE(qa.created_at AT TIME ZONE 'America/New_York') = d.day AND qa.status IN ('approved', 'auto_passed')) AS qa_approved,
  -- Bounces + replies
  (SELECT COUNT(*) FROM leads l WHERE l.org_id = o.org_id AND DATE(l.last_bounce_at AT TIME ZONE 'America/New_York') = d.day) AS bounces,
  (SELECT COUNT(*) FROM cadence_leads cl WHERE cl.org_id = o.org_id AND DATE(cl.updated_at AT TIME ZONE 'America/New_York') = d.day AND cl.status = 'paused') AS replies_paused_cadence
FROM days d
CROSS JOIN orgs o;

COMMENT ON VIEW public.cadence_funnel_daily IS
  'Last 30 days per org: companies → leads → sends → replies + Carlos QA stats. Use for daily prod monitoring.';

-- 2. queue_aging — companies stuck in 'processing' too long
CREATE OR REPLACE VIEW public.queue_aging AS
SELECT
  q.id AS queue_id,
  q.org_id,
  amc.company_name,
  q.status,
  q.claimed_at,
  q.attempted_count,
  q.error_detail,
  EXTRACT(EPOCH FROM (NOW() - q.claimed_at))::INT AS seconds_in_status
FROM icp_pipeline_queue q
JOIN account_map_companies amc ON amc.id = q.company_id
WHERE q.status IN ('processing', 'pending')
  AND q.claimed_at < NOW() - INTERVAL '15 minutes'
ORDER BY q.claimed_at ASC;

COMMENT ON VIEW public.queue_aging IS
  'Companies stuck in processing/pending state for >15min. Likely zombies or slow processing. Alert if rows >0.';

-- 3. cadence_lead_state_summary — distribution of leads by cadence state per org
CREATE OR REPLACE VIEW public.cadence_lead_state_summary AS
SELECT
  cl.org_id,
  cl.cadence_id,
  cl.status AS cadence_status,
  COUNT(*) AS lead_count,
  COUNT(*) FILTER (WHERE l.email_invalid = true) AS leads_email_invalid,
  COUNT(*) FILTER (WHERE l.linkedin_blocked = true) AS leads_linkedin_blocked,
  COUNT(*) FILTER (WHERE l.do_not_contact = true) AS leads_do_not_contact
FROM cadence_leads cl
JOIN leads l ON l.id = cl.lead_id
GROUP BY cl.org_id, cl.cadence_id, cl.status;

COMMENT ON VIEW public.cadence_lead_state_summary IS
  'Distribution of leads across cadence states (active/paused/completed/excluded) per org + cadence.';

DO $$
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '✓ Migration 140 (observability views) applied';
  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE '  cadence_funnel_daily: ready (30-day rolling per org)';
  RAISE NOTICE '  queue_aging: ready (>15min stuck rows)';
  RAISE NOTICE '  cadence_lead_state_summary: ready';
END $$;
