-- Migration 141: Deck prep slot claim
--
-- Prevents two concurrent chief-prepare-decks-for-company calls from
-- racing on the same account_map_company (would double-call bridge,
-- waste tokens, and risk writing the wrong slug). Slot is auto-stale
-- after 300s so a crashed worker doesn't permanently block.

ALTER TABLE account_map_companies
  ADD COLUMN IF NOT EXISTS deck_prep_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_amc_deck_prep_started_at
  ON account_map_companies (deck_prep_started_at)
  WHERE deck_prep_started_at IS NOT NULL;

CREATE OR REPLACE FUNCTION try_claim_deck_prep(
  p_amc_id UUID,
  p_stale_after_seconds INT DEFAULT 300
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed BOOLEAN := false;
BEGIN
  UPDATE account_map_companies
  SET deck_prep_started_at = NOW()
  WHERE id = p_amc_id
    AND (
      deck_prep_started_at IS NULL
      OR deck_prep_started_at < NOW() - (p_stale_after_seconds || ' seconds')::interval
    )
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION release_deck_prep_claim(p_amc_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE account_map_companies
  SET deck_prep_started_at = NULL
  WHERE id = p_amc_id;
END;
$$;

GRANT EXECUTE ON FUNCTION try_claim_deck_prep(UUID, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION release_deck_prep_claim(UUID) TO authenticated, service_role;
