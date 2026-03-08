-- Add manual overlay support to business case templates
-- Allows users to place variable chips directly on slides (no {{}} in PPTX needed)

ALTER TABLE business_case_templates
  ADD COLUMN IF NOT EXISTS variable_overlays JSONB DEFAULT '{"variables":[],"overlays":[]}'::jsonb NOT NULL;
