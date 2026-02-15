-- Migration: Add 'replied' status to email_messages
-- This allows tracking when a lead replies to an email

ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_status_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'replied'));
