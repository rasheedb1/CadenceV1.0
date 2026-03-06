-- 047: Add partial unique index to prevent duplicate schedule rows for the same lead+step
-- This is the root fix for the bug where multiple emails get sent to the same lead
-- when a cadence step is processed.
--
-- The index only covers active statuses (scheduled, processing) so that:
-- - Multiple 'executed', 'failed', 'canceled' rows are allowed (historical)
-- - But only ONE active schedule per lead+step combination can exist at a time

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_active_lead_step
ON public.schedules (cadence_step_id, lead_id)
WHERE status IN ('scheduled', 'processing');

-- Also clean up any existing duplicates before the index is enforced.
-- Keep the earliest-created schedule, cancel the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY cadence_step_id, lead_id
           ORDER BY created_at ASC
         ) AS rn
  FROM public.schedules
  WHERE status IN ('scheduled', 'processing')
)
UPDATE public.schedules
SET status = 'canceled',
    last_error = 'Canceled: duplicate schedule for same lead+step (migration 047)',
    updated_at = NOW()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
