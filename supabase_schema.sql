-- ALKAZRAJI FACTORY cloud storage
-- Run this once in Supabase > SQL Editor.

create table if not exists public.factory_state (
  id integer primary key check (id = 1),
  data jsonb not null default '{"dresses":[],"orders":[],"customers":[],"expenses":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  device_id text
);

alter table public.factory_state enable row level security;

revoke all on table public.factory_state from anon;
grant select, insert, update, delete on table public.factory_state to authenticated;
grant all on table public.factory_state to service_role;

drop policy if exists "factory members can read state" on public.factory_state;
drop policy if exists "factory members can create state" on public.factory_state;
drop policy if exists "factory members can update state" on public.factory_state;
drop policy if exists "factory members can delete state" on public.factory_state;

create policy "factory members can read state"
on public.factory_state
for select
to authenticated
using (true);

create policy "factory members can create state"
on public.factory_state
for insert
to authenticated
with check (id = 1);

create policy "factory members can update state"
on public.factory_state
for update
to authenticated
using (true)
with check (id = 1);

create policy "factory members can delete state"
on public.factory_state
for delete
to authenticated
using (true);
