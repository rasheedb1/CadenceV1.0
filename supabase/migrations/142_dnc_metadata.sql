-- Migration 142: do-not-contact metadata
--
-- check-replies now flags leads who write "unsubscribe", "remove me",
-- "no me contactes", etc. We need provenance — when, where, what they said —
-- so a human can audit before manually reversing.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT,
  ADD COLUMN IF NOT EXISTS do_not_contact_at TIMESTAMPTZ;
