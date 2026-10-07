-- Lock the `bets` table: public READ, no public writes.
--
-- Writes now go through POST/PATCH/DELETE /api/bets (admin cookie required,
-- service-role key on the server), so the browser's anon key only needs to
-- read. With RLS on and no insert/update/delete policies, the anon key can't
-- change a row even from dev tools. The service-role key bypasses RLS.
--
-- BEFORE RUNNING: confirm SUPABASE_SERVICE_ROLE_KEY is set in Vercel for this
-- project (Project Settings > Environment Variables). Without it the server
-- route falls back to the anon key and bet logging will start failing with
-- "new row violates row-level security policy".
--
-- Run in the Supabase SQL editor. Safe to re-run.
alter table bets enable row level security;

drop policy if exists "bets public read" on bets;
create policy "bets public read"
  on bets for select
  to anon, authenticated
  using (true);

-- No insert / update / delete policies on purpose.

-- Undo (back to today's behaviour):
--   alter table bets disable row level security;
