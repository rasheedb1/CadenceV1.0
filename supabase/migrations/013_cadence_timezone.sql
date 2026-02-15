-- Add timezone to cadences for scheduling steps at specific times
ALTER TABLE cadences ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
