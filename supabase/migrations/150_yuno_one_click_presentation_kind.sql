-- Yuno One-Click Checkout deck: allow kind='yuno_one_click' in presentations.
-- Companion to yuno-one-click-generate edge function (Spanish-default deck served at
-- chief.yuno.tools/one-click/<slug>). Keeps existing yuno_bc + sdr_bc kinds intact.

ALTER TABLE public.presentations
  DROP CONSTRAINT IF EXISTS presentations_kind_check;

ALTER TABLE public.presentations
  ADD CONSTRAINT presentations_kind_check
  CHECK (kind IN ('yuno_bc', 'sdr_bc', 'yuno_one_click'));

COMMENT ON COLUMN public.presentations.kind IS
  'Deck type. yuno_bc = client-specific commercial BC (slug at /bc/<slug>). sdr_bc = SDR regional opportunity deck (slug at /sdr-bc/<slug>). yuno_one_click = product deck for Yuno One-Click checkout, per-merchant personalization (slug at /one-click/<slug>). Extension point for future types.';
