-- workshops_bc
-- =============================================================================
-- Workshop Business Case decks served at /workshop/<slug>.
-- Parallel to merchants_ss (Stripe Sessions decks) and presentations (yuno-bc).
--
-- Use case: in-person/Zoom workshop with a single named client where the Yuno
-- team explains the platform AND walks through a tailored business case math
-- (MDR, antifraud per-attempt, approval rate uplift, integration speed).
--
-- Inputs stored as jsonb so the deck slides can render whatever the AE
-- captured during the discovery call without schema churn. business_case
-- holds the deterministic math output of the edge function so slides don't
-- recompute — they read it.
--
-- Public read by slug (cold-link sharing with workshop attendees).
-- Writes via service_role only — workshops-bc-generate edge function.
-- =============================================================================

create table if not exists public.workshops_bc (
  id                   uuid        primary key default gen_random_uuid(),
  slug                 text        not null unique,
  org_id               uuid        not null references public.organizations(id) on delete cascade,
  created_by           uuid        references auth.users(id) on delete set null,

  -- Client identity
  client_name          text        not null,
  client_logo          text,                              -- absolute URL, optional
  country              text,                              -- ISO-2, e.g. 'MX'
  language             text        not null default 'es'
                                   check (language in ('es', 'en')),

  -- Workshop framing
  workshop_title       text,                              -- "Payment Orchestration Workshop"
  workshop_date        text,                              -- free-text date ("Mayo 2026", "May 15, 2026")
  attendees            jsonb       not null default '[]'::jsonb,
                                   -- array of { name, role, side: 'yuno'|'client' }

  -- Raw client inputs from Phase A discovery (all monthly except where noted)
  -- Schema:
  --   monthly_transactions:           int
  --   avg_ticket_usd:                 numeric
  --   current_acquirers:              text[]
  --   current_antifraud:              text          (e.g. "Cybersource")
  --   current_mdr_pct:                numeric       (e.g. 1.60 = 1.60%)
  --   target_mdr_pct:                 numeric
  --   current_antifraud_per_attempt:  numeric (USD)
  --   target_antifraud_per_attempt:   numeric (USD)
  --   current_approval_rate_pct:      numeric (e.g. 82 = 82%)
  --   target_approval_rate_pct:       numeric
  --   margin_assumption_pct:          numeric (optional, default 30 — for revenue uplift)
  inputs               jsonb       not null default '{}'::jsonb,

  -- Computed math from edge function. Slides read this, never recompute.
  -- Schema:
  --   tpv_monthly_usd, tpv_annual_usd
  --   mdr_savings_annual_usd
  --   antifraud_attempts_monthly, antifraud_savings_annual_usd
  --   approvals_current_monthly, approvals_target_monthly, approvals_delta_monthly
  --   approval_tpv_uplift_annual_usd
  --   approval_revenue_uplift_annual_usd (uses margin_assumption_pct)
  --   total_impact_annual_usd
  --   computed_at
  business_case        jsonb       not null default '{}'::jsonb,

  -- Optional research enrichment (chief-deep-research-company) — payment_stack,
  -- top_markets, news, founders. Stored verbatim so slides can pull selective bits.
  research             jsonb,

  -- Source breadcrumb: 'inputs_only' | 'inputs_plus_research'
  content_source       text        not null default 'inputs_only',

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_workshops_bc_org on public.workshops_bc(org_id);
create index if not exists idx_workshops_bc_created on public.workshops_bc(created_at desc);
create index if not exists idx_workshops_bc_client on public.workshops_bc(lower(client_name));

create trigger workshops_bc_set_updated_at
  before update on public.workshops_bc
  for each row execute function public.update_updated_at_column();

-- ── RLS ──
-- Decks are public-read by slug (cold-link sharing with workshop attendees),
-- same model as merchants_ss. Writes restricted to service_role; the
-- workshops-bc-generate edge function authenticates and inserts on behalf
-- of the org member who requested generation.
alter table public.workshops_bc enable row level security;

create policy "workshops_bc_public_read"
  on public.workshops_bc
  for select
  to anon, authenticated
  using (true);

create policy "workshops_bc_service_write"
  on public.workshops_bc
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.workshops_bc is
  'Workshop Business Case decks served at /workshop/<slug>. Distinct from merchants_ss (SS Deck) and presentations (yuno-bc / sdr-bc). Inputs+computed-math stored as jsonb; slides render deterministically from business_case column.';
