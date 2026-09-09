-- Benefit Cliff Navigator — initial schema.
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).
--
-- Mirrors src/types.ts's HouseholdProfile/HouseholdMember/EnrolledScheme shapes, plus tables for
-- the "diff eligibility over time" and notification features. Every table is scoped to the owning
-- user via Row Level Security — a user can only ever read/write their own rows.

create extension if not exists "pgcrypto";

-- One row per user, extending auth.users. Household-level HouseholdProfile fields.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  gross_household_monthly_income numeric not null,
  housing_type text not null check (housing_type in ('hdb_1_2_room', 'hdb_3_room', 'hdb_4_room', 'hdb_5_room_or_exec', 'private_property')),
  annual_value_of_home numeric not null,
  property_count integer not null,
  has_certified_care_need boolean not null,
  notifications_enabled boolean not null default false,
  notification_email text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per HouseholdMember. is_applicant replaces the "members[0] is the applicant"
-- array-order convention used in-memory, since DB rows have no inherent order.
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  is_applicant boolean not null default false,
  order_index integer not null default 0,
  age integer not null,
  citizenship text not null check (citizenship in ('citizen', 'pr', 'other')),
  employment_type text not null check (employment_type in ('employee', 'self_employed', 'platform_worker', 'not_employed')),
  has_disability boolean not null default false,
  cpf_contributions_by_age_55 numeric not null default 0
);

-- One row per scheme the household says it's enrolled in.
create table public.enrolled_schemes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scheme_id text not null,
  enrollment_date date not null,
  unique (profile_id, scheme_id)
);

-- Last-computed eligibility results per profile, so a scheduled job has something to diff the
-- next computation against (to detect "you gained/lost eligibility for X" since last time).
create table public.eligibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  computed_at timestamptz not null default now(),
  results jsonb not null -- serialized [{ schemeId, status, estimatedBenefitAmount }]
);
create index eligibility_snapshots_profile_computed_idx on public.eligibility_snapshots (profile_id, computed_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('renewal_due', 'renewal_overdue', 'eligibility_gained', 'eligibility_lost')),
  scheme_id text,
  headline text not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_created_idx on public.notifications (profile_id, created_at desc);

-- Row Level Security: every table is readable/writable only by its owning user.
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.enrolled_schemes enable row level security;
alter table public.eligibility_snapshots enable row level security;
alter table public.notifications enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own members" on public.household_members for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own enrolled schemes" on public.enrolled_schemes for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own snapshots" on public.eligibility_snapshots for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "own notifications" on public.notifications for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- Note: the scheduled notification job (Edge Function) runs as no particular user and needs to
-- read/write across ALL profiles, so it authenticates with the service_role key, which bypasses
-- RLS entirely by design. Never expose the service_role key to the browser.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
