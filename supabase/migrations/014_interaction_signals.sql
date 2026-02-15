-- Add new notification types for email opens and LinkedIn read receipts
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('reply_detected','cadence_completed','step_failed','automation_started','email_opened','message_read'));

-- Add read_at to linkedin_messages for tracking when outbound messages were read
ALTER TABLE linkedin_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Allow service-role inserts into email_messages and email_events (for tracking pixel endpoint)
-- The existing RLS policies only allow auth.uid() = owner_user_id,
-- but the tracking pixel endpoint has no user auth. Service role bypasses RLS.
