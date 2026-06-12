-- Multilingual support for the three deck systems
-- =============================================================================
-- Adds language (es | en | pt) + currency (USD, MXN, BRL, …) to merchants_ss
-- and workshops_bc. The third system (presentations table, kind='sdr_bc')
-- stores both fields inside the existing `defaults` jsonb column — no schema
-- change needed there, just a documentation update on the column comment.
--
-- Math is unaffected. Edge functions compute identical numbers regardless of
-- language; only labels and number formatting differ at render time.
--
-- Backwards compatibility:
--   - workshops_bc.language default stays 'es' (matches the historical skill
--     default). CHECK constraint widened from ('es','en') to ('es','en','pt').
--   - merchants_ss.language defaults to 'en' (cadence step calls automatic
--     SS-Deck generation in English per the 2026-05-18 policy).
--   - All new columns have safe defaults; existing rows fill in automatically.
-- =============================================================================

-- ── workshops_bc ─────────────────────────────────────────────────────────────
alter table public.workshops_bc
  drop constraint if exists workshops_bc_language_check;

alter table public.workshops_bc
  add constraint workshops_bc_language_check
  check (language in ('es', 'en', 'pt'));

alter table public.workshops_bc
  add column if not exists currency text not null default 'USD';

comment on column public.workshops_bc.language is
  'Deck rendering language. es | en | pt. Default es preserves legacy skill behaviour; the skill always prompts.';
comment on column public.workshops_bc.currency is
  'Display currency for monetary fields in the deck. Whitelist enforced in app code: USD, MXN, BRL, COP, ARS, CLP, PEN, EUR, GBP. Math is currency-agnostic — this only changes formatting.';

-- ── merchants_ss ─────────────────────────────────────────────────────────────
alter table public.merchants_ss
  add column if not exists language text not null default 'en'
    check (language in ('es', 'en', 'pt'));

alter table public.merchants_ss
  add column if not exists currency text not null default 'USD';

comment on column public.merchants_ss.language is
  'Deck rendering language. es | en | pt. Default en — cadence step generate_ss_deck always emits English per the 2026-05-18 automatic-default policy.';
comment on column public.merchants_ss.currency is
  'Display currency for monetary fields in the deck. Same whitelist as workshops_bc.currency.';

-- ── presentations (kind=sdr_bc) ──────────────────────────────────────────────
-- No DDL — language and currency live in the existing `defaults` jsonb under
-- keys `language` (es|en|pt, default 'en') and `currency` (default 'USD').
-- sdr-bc-generate persists them; sdr-bc-render reads them. Documenting here
-- so future maintainers can grep this migration for the convention.
comment on column public.presentations.defaults is
  'Deck-specific input data. For kind=yuno_bc: BC_DEFAULTS object. For kind=sdr_bc: regions + research + language (''es''|''en''|''pt'') + currency (default ''USD''). Math is currency-agnostic.';
