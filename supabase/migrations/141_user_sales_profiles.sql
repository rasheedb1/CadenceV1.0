-- Per-user sales profile used to personalize the closing slide of the SDR BC.
-- One row per auth user. Editable from the Presentations page.
-- Falls back to org-wide defaults inside sdr-bc-generate when no row exists.

create table if not exists public.user_sales_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  name               text not null,
  title              text,                    -- e.g. "Director Comercial Latam"
  email              text not null,           -- mirrors auth.email but explicit so deck doesn't depend on auth lookup
  phone              text,                    -- E.164 ideally, free-form accepted
  demo_calendar_url  text,                    -- Calendly / SavvyCal / etc, used by "Schedule workshop" CTA
  avatar_url         text,                    -- optional headshot; deck falls back to initials
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function public.tg_user_sales_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_sales_profiles_updated_at on public.user_sales_profiles;
create trigger user_sales_profiles_updated_at
  before update on public.user_sales_profiles
  for each row execute function public.tg_user_sales_profiles_updated_at();

alter table public.user_sales_profiles enable row level security;

-- Only the row owner can see/modify their own profile.
drop policy if exists "sales_profile_self_select" on public.user_sales_profiles;
create policy "sales_profile_self_select"
  on public.user_sales_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "sales_profile_self_insert" on public.user_sales_profiles;
create policy "sales_profile_self_insert"
  on public.user_sales_profiles for insert
  with check (auth.uid() = user_id);

drop policy if exists "sales_profile_self_update" on public.user_sales_profiles;
create policy "sales_profile_self_update"
  on public.user_sales_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypasses RLS by default, so edge functions (sdr-bc-generate)
-- can read any user's profile when generating decks on their behalf.
