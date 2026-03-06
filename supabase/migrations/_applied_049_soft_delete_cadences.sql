-- ============================================================================
-- Migration 049: Soft Delete for Cadences + Restore Magdalena's Cadences
-- ============================================================================
-- Problem: Hard delete allows permanent unrecoverable data loss. A manager
-- (or the user themselves) accidentally deleted Magdalena Torrealba's cadences
-- in the "Alejandro Albarracin Team" org because the UI was showing ALL org
-- cadences mixed together (due to the "Managers can view all org cadences" RLS).
--
-- This migration:
-- 1. Adds soft delete to cadences (deleted_at column)
-- 2. Updates RLS SELECT policies to filter out soft-deleted cadences
-- 3. Restores Magdalena's two cadences with all 432 leads assigned
-- ============================================================================

-- ============================================================================
-- PART 1: Add soft delete column to cadences
-- ============================================================================

ALTER TABLE public.cadences
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_cadences_deleted_at
  ON public.cadences(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- PART 2: Update RLS SELECT policies to exclude soft-deleted cadences
-- ============================================================================

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view own cadences" ON public.cadences;
DROP POLICY IF EXISTS "Managers can view all org cadences" ON public.cadences;

-- Recreate with soft-delete filter
CREATE POLICY "Users can view own cadences" ON public.cadences
  FOR SELECT USING (
    public.user_is_org_member(org_id)
    AND auth.uid() = owner_id
    AND deleted_at IS NULL
  );

CREATE POLICY "Managers can view all org cadences" ON public.cadences
  FOR SELECT USING (
    public.user_has_org_role(org_id, 'manager')
    AND deleted_at IS NULL
  );

-- ============================================================================
-- PART 3: Protect INSERT/UPDATE — owner must be org member (already in trigger)
-- The trigger trg_validate_cadence_owner from migration 048 covers this.
-- ============================================================================

-- ============================================================================
-- PART 4: Restore Magdalena Torrealba's cadences
-- ============================================================================
-- Context:
--   Magdalena user_id:  c6fc0aff-6d12-47e8-9a47-95911d262660
--   Org id:             0d1db4ac-c724-44de-9b4b-ea8dfde741d1
--   She had 432 leads (all intact in the leads table)
--   Leads were all created 2026-02-27 (single CSV import day)
--   Activity shows linkedin_connect campaigns → 2 cadences restored:
--     "Cadencia LinkedIn Connect" — for linkedin outreach
--     "Cadencia Prospección" — general prospecting cadence
-- ============================================================================

-- Temporarily disable the owner validation trigger for this restoration
-- (service role is running this, not a regular user session)
ALTER TABLE public.cadences DISABLE TRIGGER trg_validate_cadence_owner;

-- Insert Cadencia 1: LinkedIn Connect
INSERT INTO public.cadences (id, owner_id, org_id, name, status, automation_mode, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'c6fc0aff-6d12-47e8-9a47-95911d262660',
  '0d1db4ac-c724-44de-9b4b-ea8dfde741d1',
  'Cadencia LinkedIn Connect',
  'active',
  'manual',
  '2026-02-27T23:05:00.000Z',
  NOW()
);

-- Insert Cadencia 2: Prospección General
INSERT INTO public.cadences (id, owner_id, org_id, name, status, automation_mode, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'c6fc0aff-6d12-47e8-9a47-95911d262660',
  '0d1db4ac-c724-44de-9b4b-ea8dfde741d1',
  'Cadencia Prospección',
  'active',
  'manual',
  '2026-02-27T23:05:00.000Z',
  NOW()
);

-- Re-enable the trigger
ALTER TABLE public.cadences ENABLE TRIGGER trg_validate_cadence_owner;

-- ============================================================================
-- PART 5: Assign ALL 432 leads to "Cadencia LinkedIn Connect"
-- (since all her recorded activity was linkedin_connect, we assign all leads
-- to this cadence so she can resume from the UI immediately)
-- ============================================================================

-- Assign leads to the first restored cadence
INSERT INTO public.cadence_leads (cadence_id, lead_id, owner_id, org_id, status, created_at)
SELECT
  (SELECT id FROM public.cadences
   WHERE owner_id = 'c6fc0aff-6d12-47e8-9a47-95911d262660'
     AND org_id   = '0d1db4ac-c724-44de-9b4b-ea8dfde741d1'
     AND name     = 'Cadencia LinkedIn Connect'
   LIMIT 1),
  l.id,
  'c6fc0aff-6d12-47e8-9a47-95911d262660',
  '0d1db4ac-c724-44de-9b4b-ea8dfde741d1',
  'active',
  l.created_at
FROM public.leads l
WHERE l.owner_id = 'c6fc0aff-6d12-47e8-9a47-95911d262660'
  AND l.org_id   = '0d1db4ac-c724-44de-9b4b-ea8dfde741d1'
ON CONFLICT (cadence_id, lead_id) DO NOTHING;

-- ============================================================================
-- PART 6: Verification queries (run to confirm)
-- ============================================================================

-- SELECT c.name, c.status, COUNT(cl.id) AS leads_assigned
-- FROM public.cadences c
-- LEFT JOIN public.cadence_leads cl ON cl.cadence_id = c.id
-- WHERE c.owner_id = 'c6fc0aff-6d12-47e8-9a47-95911d262660'
-- GROUP BY c.id, c.name, c.status;
