-- Add Salesforce push tracking columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesforce_lead_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesforce_pushed_at TIMESTAMPTZ;
