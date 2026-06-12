-- =====================================================================
-- 152: RPC find_amc_by_org_norm — matches the (org_id, normalize_company_name(company_name)) UNIQUE INDEX
-- =====================================================================
-- Why:
--   Mig 139 created UNIQUE(org_id, normalize_company_name(company_name)) on
--   account_map_companies. Callers (sdr-bc-research-core, chief-consume-from-list)
--   were looking up existing rows with `.ilike('company_name', name)` — that's
--   case-insensitive exact match, NOT normalize-aware. So when the DB has
--   "Apple Inc" and the user types "Apple", lookup misses, INSERT fires, the
--   unique index raises 23505 ("Could not create company row (23505 with no
--   match)"), and the adopt-after-conflict path uses the same broken ilike
--   lookup → user sees a 500.
--
-- Fix:
--   Mirror the existing per-account_map helper (mig 132 line 96), but scoped
--   by org_id — which is the dimension of the mig 139 constraint.
--
-- Callers (post-deploy):
--   - supabase/functions/_shared/sdr-bc-research-core.ts (lookup + adopt)
--   - supabase/functions/chief-consume-from-list/index.ts (adopt-after-23505)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.find_amc_by_org_norm(
  p_org_id       UUID,
  p_company_name TEXT
)
RETURNS TABLE (
  id              UUID,
  company_name    TEXT,
  account_map_id  UUID,
  pipeline_state  TEXT,
  website         TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT amc.id, amc.company_name, amc.account_map_id, amc.pipeline_state, amc.website
    FROM public.account_map_companies amc
   WHERE amc.org_id = p_org_id
     AND normalize_company_name(amc.company_name) = normalize_company_name(p_company_name)
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.find_amc_by_org_norm(UUID, TEXT) IS
  'V152: matches the mig 139 UNIQUE(org_id, normalize_company_name) constraint. Callers MUST use this before INSERT and after 23505 — plain ilike misses suffix-stripped duplicates (Apple vs Apple Inc, Coppel vs Coppel SA) and surfaces a 500 to the user.';

-- =====================================================
-- Smoke test
-- =====================================================
DO $$
DECLARE
  v_found INT;
BEGIN
  SELECT COUNT(*) INTO v_found
    FROM find_amc_by_org_norm(
      '553315b5-42d0-4518-a461-e4cb12914c54'::UUID,  -- Yuno org
      'Rappi'
    );

  RAISE NOTICE 'V152 smoke: find_amc_by_org_norm(Yuno, Rappi) returned % row(s)', v_found;

  -- Suffix-stripping is the whole point — make sure the regex still strips Inc/Corp/LLC
  IF normalize_company_name('Apple Inc') <> normalize_company_name('Apple') THEN
    RAISE EXCEPTION 'V152 fail: normalize_company_name suffix-strip regression (Apple/Apple Inc)';
  END IF;
  IF normalize_company_name('Acme LLC') <> normalize_company_name('Acme') THEN
    RAISE EXCEPTION 'V152 fail: normalize_company_name suffix-strip regression (Acme/Acme LLC)';
  END IF;
END $$;
