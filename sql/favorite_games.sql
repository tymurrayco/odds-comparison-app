-- Starred games, stored on the account so they follow a person across devices.
-- One row per (account, game). Each person reads and changes only their own.
--
-- Run in the Supabase SQL editor. Safe to re-run.
create table if not exists public.favorite_games (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.favorite_games enable row level security;

drop policy if exists "favorites owner read" on public.favorite_games;
create policy "favorites owner read"
  on public.favorite_games for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "favorites owner add" on public.favorite_games;
create policy "favorites owner add"
  on public.favorite_games for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "favorites owner remove" on public.favorite_games;
create policy "favorites owner remove"
  on public.favorite_games for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Check: row security on, three policies.
select c.relrowsecurity as row_security_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'favorite_games') as policies
from pg_class c
where c.oid = 'public.favorite_games'::regclass;

-- Undo:
--   drop table if exists public.favorite_games;
