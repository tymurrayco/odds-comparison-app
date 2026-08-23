-- sql/odds_api_usage.sql
-- Odds API credit-counter snapshots — the "fuel gauge" behind the Bet Admin
-- API Credits panel. Run once in the Supabase SQL editor.
--
-- Every Odds API response carries x-requests-remaining / x-requests-used for
-- the WHOLE key (shared with kalshi-mmbot), so any snapshot reflects total
-- spend across both apps. Rows are written by /api/odds (throttled, on paid
-- calls) and /api/credit-usage (on Bet Admin loads, via a free /v4/sports
-- call that costs 0 credits).
--
-- No RLS, matching nfl_props.sql / power_rating_sets — the app runs
-- anon-key-only. Covered by the existing auth audit item.

create table if not exists odds_api_usage (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  remaining int not null,           -- x-requests-remaining after the call
  used int not null,                -- x-requests-used (resets with the plan month)
  source text not null default 'site'  -- 'odds-route' | 'admin'
);

create index if not exists odds_api_usage_ts_idx on odds_api_usage (ts desc);
