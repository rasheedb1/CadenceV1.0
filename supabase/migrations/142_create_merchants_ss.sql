-- merchants_ss
-- =============================================================================
-- Stripe Sessions style deck data — ported from yuno-sales-pitch-maker repo.
-- Served by the new Chief route /m/<slug>. Totally separate from
-- presentations table (yuno-bc / sdr-bc); schema mirrors the upstream repo
-- (scripts/sql/001_create_merchants.sql) so future syncs stay clean.
--
-- Public read by slug (decks are shared with merchants as cold links).
-- Writes via service_role only — ss-deck-generate edge function.
-- =============================================================================

create table if not exists public.merchants_ss (
  id                 uuid        primary key default gen_random_uuid(),
  slug               text        not null unique,
  org_id             uuid        not null references public.organizations(id) on delete cascade,
  created_by         uuid        references auth.users(id) on delete set null,
  name               text        not null,
  -- Optional brand assets. Logo URLs are absolute (cdn or supabase storage).
  -- logo_mono is a white-silhouette companion used in diagrams; null falls
  -- back to logo with brightness(0)+invert(1).
  logo               text,
  logo_mono          text,
  -- Per-merchant cover override. Empty means the cover renders the default
  -- "Hello {name} team!" greeting.
  greeting           text,
  -- Mode: 'merchant' | 'banking' | 'partner'. v1 only ships 'merchant';
  -- the field exists so we can flip a row without a schema change.
  mode               text        not null default 'merchant'
                                check (mode in ('merchant', 'banking', 'partner')),
  -- Show role subtitles ("Japan · acquirer") under each PSP node in the
  -- Diagnostic topology. Defaults off — role text is inconsistent across
  -- merchants and looks worse than no label when sparse.
  show_psp_roles     boolean     not null default false,
  -- Dynamic slide content. Shapes mirror the upstream repo's toSlideData()
  -- adapter so the React slide components consume them unchanged.
  pain_titles        text[]      not null default '{}',
  psps               jsonb       not null default '[]'::jsonb,
  psps_disclaimer    text,
  missing_methods    jsonb       not null default '[]'::jsonb,
  capability_titles  text[]      not null default '{}',
  capability_descs   text[]      not null default '{}',
  capabilities_live  jsonb       not null default '[]'::jsonb,
  -- Source breadcrumb for debugging. Set to 'template' on insert when no
  -- research was run; flipped to 'research' / 'manual' as v2 lands.
  content_source     text        not null default 'template',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_merchants_ss_org on public.merchants_ss(org_id);
create index if not exists idx_merchants_ss_created on public.merchants_ss(created_at desc);

create trigger merchants_ss_set_updated_at
  before update on public.merchants_ss
  for each row execute function public.update_updated_at_column();

-- ── RLS ──
-- Decks are public-read by slug (cold link sharing with prospects), same
-- model as the upstream repo. Writes restricted to service_role; the
-- ss-deck-generate edge function authenticates and inserts on behalf of
-- the org member who requested generation.
alter table public.merchants_ss enable row level security;

create policy "merchants_ss_public_read"
  on public.merchants_ss
  for select
  to anon, authenticated
  using (true);

create policy "merchants_ss_service_write"
  on public.merchants_ss
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.merchants_ss is
  'Stripe Sessions style decks served at /m/<slug>. Schema mirrors yuno-sales-pitch-maker upstream repo. Separate from presentations (yuno-bc / sdr-bc).';
