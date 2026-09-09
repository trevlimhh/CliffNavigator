-- Splits the single notifications_enabled flag into independent email/push channels, and adds
-- storage for Web Push subscriptions (one row per browser/device the user has enabled push on).
-- Run this once in the Supabase SQL Editor, after 0001 and 0002.

alter table public.profiles
  rename column notifications_enabled to email_notifications_enabled;

alter table public.profiles
  add column push_notifications_enabled boolean not null default false;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- notifications.channel could previously only be 'in_app' or 'email'; now a notification can also
-- have gone out as a push message.
alter table public.notifications drop constraint notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check check (channel in ('in_app', 'email', 'push'));
