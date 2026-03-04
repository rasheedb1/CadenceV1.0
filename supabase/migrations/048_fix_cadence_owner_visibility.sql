-- ============================================================================
-- Migration 048: Fix cadence visibility — orphaned owner_id
-- ============================================================================
-- Context: Migration 040 introduced per-user RLS (owner_id = auth.uid()).
-- Problem: Cadences created by an admin on behalf of another user have
--          owner_id pointing to the admin, so the member cannot see them.
-- Fix:     For cadences in an org where owner_id does NOT belong to an active
--          org member but a sibling member clearly "owns" them (single owner
--          of the org is the admin), we provide a safe remediation path.
-- ============================================================================

-- ============================================================================
-- STEP 1 (DIAGNOSTIC — run first, review output before proceeding)
-- ============================================================================
-- Find cadences in any org where the owner is NOT the logged-in viewer.
-- Run this to identify affected cadences for Magdalena Torrealba specifically:
--
-- SELECT
--   c.id           AS cadence_id,
--   c.name         AS cadence_name,
--   c.owner_id     AS current_owner_id,
--   p_owner.full_name  AS current_owner_name,
--   o.name         AS org_name,
--   c.created_at
-- FROM public.cadences c
-- JOIN public.organizations o ON o.id = c.org_id
-- LEFT JOIN public.profiles p_owner ON p_owner.user_id = c.owner_id
-- WHERE o.name ILIKE '%alejandro%steam%'   -- adjust to match org name
-- ORDER BY c.created_at DESC;
--
-- Also find Magdalena's user_id:
-- SELECT u.id, u.email, p.full_name
-- FROM auth.users u
-- JOIN public.profiles p ON p.user_id = u.id
-- WHERE u.email ILIKE '%magdalena%'
--    OR p.full_name ILIKE '%magdalena%torrealba%';

-- ============================================================================
-- STEP 2 (REMEDIATION — replace UUIDs after running Step 1)
-- ============================================================================
-- After confirming the cadence_ids and Magdalena's user_id, run:
--
-- UPDATE public.cadences
-- SET owner_id = '<magdalena_user_id>'        -- her actual UUID
-- WHERE id IN (
--   '<cadence_id_1>',                         -- UUIDs of her missing cadences
--   '<cadence_id_2>'
-- )
-- AND org_id = '<org_id>';                    -- safety: scope to her org
--
-- Do the same for cadence_steps, cadence_leads, lead_step_instances, schedules:
--
-- UPDATE public.cadence_steps
-- SET owner_id = '<magdalena_user_id>'
-- WHERE cadence_id IN ('<cadence_id_1>', '<cadence_id_2>')
-- AND org_id = '<org_id>';
--
-- UPDATE public.cadence_leads
-- SET owner_id = '<magdalena_user_id>'
-- WHERE cadence_id IN ('<cadence_id_1>', '<cadence_id_2>')
-- AND org_id = '<org_id>';
--
-- UPDATE public.lead_step_instances
-- SET owner_id = '<magdalena_user_id>'
-- WHERE cadence_id IN ('<cadence_id_1>', '<cadence_id_2>')
-- AND org_id = '<org_id>';
--
-- UPDATE public.schedules
-- SET owner_id = '<magdalena_user_id>'
-- WHERE cadence_id IN ('<cadence_id_1>', '<cadence_id_2>')
-- AND org_id = '<org_id>';

-- ============================================================================
-- STEP 3 (PERMANENT PREVENTION — applies automatically going forward)
-- ============================================================================

-- Add a trigger that ensures cadence owner_id is always a member of the org
-- at creation time. This catches admin-created cadences with wrong owner_id.

CREATE OR REPLACE FUNCTION public.validate_cadence_owner_is_org_member()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify that the owner_id being set is a member of the cadence's org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = NEW.org_id AND user_id = NEW.owner_id
  ) THEN
    RAISE EXCEPTION
      'cadence owner_id (%) is not a member of org (%)',
      NEW.owner_id, NEW.org_id
    USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_cadence_owner ON public.cadences;
CREATE TRIGGER trg_validate_cadence_owner
  BEFORE INSERT OR UPDATE OF owner_id, org_id ON public.cadences
  FOR EACH ROW EXECUTE FUNCTION public.validate_cadence_owner_is_org_member();

-- ============================================================================
-- STEP 4 (DETECTION — audit view for super admins)
-- ============================================================================
-- View that shows any cadences whose owner is no longer an org member
-- (catches future orphaned data regardless of how it got there).

CREATE OR REPLACE VIEW public.orphaned_cadences AS
SELECT
  c.id           AS cadence_id,
  c.name         AS cadence_name,
  c.owner_id,
  p.full_name    AS owner_name,
  c.org_id,
  o.name         AS org_name,
  c.created_at
FROM public.cadences c
JOIN public.organizations o ON o.id = c.org_id
LEFT JOIN public.profiles p ON p.user_id = c.owner_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members om
  WHERE om.org_id = c.org_id AND om.user_id = c.owner_id
);

COMMENT ON VIEW public.orphaned_cadences IS
  'Cadences whose owner_id is not a member of the cadence org — invisible to the intended user under RLS policy from migration 040.';
