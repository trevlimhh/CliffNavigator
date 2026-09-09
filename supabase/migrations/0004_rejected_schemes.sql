-- Tracks schemes a household applied for and was turned down for — a real-world caseworker
-- decision, distinct from our own computed EligibilityStatus (a discretionary scheme like ComCare
-- can compute as "possibly eligible, needs assessment" while the actual outcome was "no"). Mirrors
-- enrolled_schemes' shape and RLS. Run this once in the Supabase SQL Editor, after 0001-0003.

create table public.rejected_schemes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  scheme_id text not null,
  rejected_date date not null,
  note text,
  unique (profile_id, scheme_id)
);

alter table public.rejected_schemes enable row level security;
create policy "own rejected schemes" on public.rejected_schemes for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
