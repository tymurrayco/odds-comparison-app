-- Per-user bets, step 1: every bet gets an owner.
--
-- Adds a nullable `user_id` pointing at the Supabase Auth user, then gives
-- every existing bet to the one account that has signed in so far (Tyler).
-- Nothing reads the column yet, so the live site is unaffected.
--
-- BEFORE RUNNING: sign in once with Google so your user row exists —
-- open https://vpjseqlqmygloqiqkglp.supabase.co/auth/v1/authorize?provider=google
-- and check Authentication > Users shows exactly one user.
--
-- Run in the Supabase SQL editor. Safe to re-run.
alter table bets
  add column if not exists user_id uuid references auth.users (id);

create index if not exists bets_user_id_idx on bets (user_id);

-- Backfill: refuses to guess if more than one account exists.
do $$
declare
  n int;
begin
  select count(*) into n from auth.users;
  if n <> 1 then
    raise exception 'expected exactly 1 auth user for the backfill, found %', n;
  end if;
  update bets set user_id = (select id from auth.users) where user_id is null;
end $$;

-- Check: should return one row, your user id with the full bet count.
select user_id, count(*) from bets group by user_id;

-- Undo:
--   drop index if exists bets_user_id_idx;
--   alter table bets drop column if exists user_id;
