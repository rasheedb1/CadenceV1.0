-- Add 'processing' status to schedules to prevent race conditions in queue processing.
-- When process-queue claims a schedule, it atomically sets status to 'processing'
-- so concurrent invocations skip already-claimed items.

ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE schedules ADD CONSTRAINT schedules_status_check
  CHECK (status IN ('scheduled', 'processing', 'executed', 'canceled', 'skipped_due_to_state_change', 'failed'));
