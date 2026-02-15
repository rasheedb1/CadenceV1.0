-- Add same_day_delay_hours to cadences table
-- Controls the number of hours between steps on the same day in automated cadences
ALTER TABLE cadences ADD COLUMN IF NOT EXISTS same_day_delay_hours integer DEFAULT 1;
