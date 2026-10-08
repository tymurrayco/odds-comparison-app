-- Mark an account as premium: it sees the parts of the site that are not
-- public yet (for now the Ledger tabs beyond Ratings on /fbs and /fcs).
--
-- The flag lives in the Auth user's app_metadata, which only the service
-- role / this SQL editor can write — a visitor cannot set it on themselves.
-- The site reads it from the sign-in session, so SIGN OUT AND BACK IN after
-- running this (or wait up to an hour for the session to refresh).
--
-- This version flags the owner of the oldest bet (Tyler). To flag someone
-- else, swap the where clause for:  where email = 'friend@example.com'
--
-- Run in the Supabase SQL editor. Safe to re-run.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"premium": true}'::jsonb
where id = (select user_id from bets where user_id is not null order by created_at limit 1);

-- Check: lists every premium account.
select email, raw_app_meta_data->'premium' as premium
from auth.users
where raw_app_meta_data->>'premium' = 'true';

-- Undo:
--   update auth.users set raw_app_meta_data = raw_app_meta_data - 'premium' where email = '...';
