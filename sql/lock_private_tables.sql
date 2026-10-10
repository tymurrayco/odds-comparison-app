-- Close two sets of tables that a signed-out visitor could read with the
-- site's public key:
--   book_clicks            the sportsbook click log (browser details, referrer,
--                          state, country per click)
--   nfl_survivor_picks /   Tyler's survivor picks and league settings
--   nfl_survivor_entries
--
-- Row security goes ON with NO policies, so the public (anon) key and
-- signed-in visitors read and write nothing. The server keeps working: the
-- /go click-out and /api/nfl/survivor use the service-role key, which
-- bypasses row security. (Local dev has no service-role key, so click
-- logging and the survivor panel stop working locally — production only.)
--
-- Run in the Supabase SQL editor. Safe to re-run.
alter table public.book_clicks enable row level security;
alter table public.nfl_survivor_picks enable row level security;
alter table public.nfl_survivor_entries enable row level security;

-- Remove any open-read rules left on them.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('book_clicks', 'nfl_survivor_picks', 'nfl_survivor_entries')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Check: three rows, row_security_on = true, policies = 0.
select c.relname as table_name,
       c.relrowsecurity as row_security_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.oid in ('public.book_clicks'::regclass, 'public.nfl_survivor_picks'::regclass, 'public.nfl_survivor_entries'::regclass)
order by 1;

-- Undo:
--   alter table public.book_clicks disable row level security;
--   alter table public.nfl_survivor_picks disable row level security;
--   alter table public.nfl_survivor_entries disable row level security;
