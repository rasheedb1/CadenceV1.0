-- Vendor (AE) fields on SS deck rows
-- =============================================================================
-- Adds vendor_name + vendor_title to merchants_ss so the cover (slide 1) and
-- CTA (slide 21) can show "Prepared by {name} · {title}" — mirrors the SDR BC
-- pattern (presentations.defaults.sdr_name / sdr_position). Both nullable;
-- empty values fall back to the generic "Yuno Sales Team / Sales Strategy"
-- defaults the slides already render today.
--
-- Captured from the new NewSsDeckForm Step 1 wizard.
-- =============================================================================

alter table public.merchants_ss
  add column if not exists vendor_name text;

alter table public.merchants_ss
  add column if not exists vendor_title text;

comment on column public.merchants_ss.vendor_name is
  'AE / SDR name shown on cover + CTA "Prepared by". Null falls back to generic Yuno Sales Team copy.';
comment on column public.merchants_ss.vendor_title is
  'AE / SDR title (e.g., "SDR · LATAM") shown below vendor_name. Null hides the line.';
