-- A private note per game, stored on the account. One row per (account, game).
-- Each person reads and changes only their own notes; nobody else, followers
-- included, can see them. game_label / commence_time are kept with the note
-- so a notes list can be shown later without the odds feed.
--
-- Run in the Supabase SQL editor. Safe to re-run.
create table if not exists public.game_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  note text not null check (char_length(note) between 1 and 1000),
  game_label text,
  commence_time timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

alter table public.game_notes enable row level security;

drop policy if exists "notes owner read" on public.game_notes;
create policy "notes owner read"
  on public.game_notes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notes owner add" on public.game_notes;
create policy "notes owner add"
  on public.game_notes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes owner change" on public.game_notes;
create policy "notes owner change"
  on public.game_notes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notes owner remove" on public.game_notes;
create policy "notes owner remove"
  on public.game_notes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Check: row security on, four policies.
select c.relrowsecurity as row_security_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'game_notes') as policies
from pg_class c
where c.oid = 'public.game_notes'::regclass;

-- Undo:
--   drop table if exists public.game_notes;
