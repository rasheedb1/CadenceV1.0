-- SDR BC: allow account_map_companies rows that aren't tied to a specific
-- account_map or owner. SDR Business Cases target arbitrary prospects that
-- the AE researches ad-hoc — they don't need to be members of an ICP bucket.
-- All other paths still set these fields, so the relax has no impact on
-- the existing account-mapping pipeline.

ALTER TABLE public.account_map_companies
  ALTER COLUMN account_map_id DROP NOT NULL,
  ALTER COLUMN owner_id DROP NOT NULL;

COMMENT ON COLUMN public.account_map_companies.account_map_id IS
  'FK to account_maps. NULL when the row was created outside the account-mapping pipeline (e.g. by /sdr-bc for ad-hoc prospect research).';
COMMENT ON COLUMN public.account_map_companies.owner_id IS
  'FK to auth.users — the AE who owns the prospect. NULL when created outside the account-mapping pipeline.';
