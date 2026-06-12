-- SDR Business Case: allow kind='sdr_bc' in presentations.
-- Companion to sdr-bc-generate edge function (English-only deck served at
-- chief.yuno.tools/sdr-bc/<slug>). Keeps the existing yuno_bc kind intact.

ALTER TABLE public.presentations
  DROP CONSTRAINT IF EXISTS presentations_kind_check;

ALTER TABLE public.presentations
  ADD CONSTRAINT presentations_kind_check
  CHECK (kind IN ('yuno_bc', 'sdr_bc'));

COMMENT ON COLUMN public.presentations.kind IS
  'Deck type. yuno_bc = client-specific business case (slug at /bc/<slug>). sdr_bc = SDR regional opportunity deck (slug at /sdr-bc/<slug>). Extension point for future types.';
