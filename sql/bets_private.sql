-- Per-user bets, step 2: each person can read only their own bets.
--
-- Replaces the "bets public read" policy from sql/bets_rls.sql. Signed-out
-- visitors (anon key) read nothing; a signed-in visitor reads rows whose
-- user_id is theirs. Still no insert / update / delete policies: all writes
-- go through /api/bets with the service-role key, which also serves the
-- /bet/[id] share cards and the settle cron (service role bypasses RLS).
--
-- BEFORE RUNNING: the deploy that sends the sign-in token with bet writes
-- must be live, and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel.
--
-- Run in the Supabase SQL editor. Safe to re-run.
alter table bets enable row level security;

drop policy if exists "bets public read" on bets;
drop policy if exists "bets owner read" on bets;
create policy "bets owner read"
  on bets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Undo (back to everyone reads everything):
--   drop policy if exists "bets owner read" on bets;
--   create policy "bets public read" on bets for select to anon, authenticated using (true);
