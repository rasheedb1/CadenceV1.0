-- ============================================================================
-- Migration 037: Allow 'salesforce_sync' as a source in company_registry
-- ============================================================================

-- Drop the old CHECK constraint on source and add updated one
ALTER TABLE public.company_registry DROP CONSTRAINT IF EXISTS company_registry_source_check;
ALTER TABLE public.company_registry ADD CONSTRAINT company_registry_source_check
  CHECK (source IN ('csv_import', 'manual', 'auto_prospected', 'discovery', 'salesforce_sync'));
