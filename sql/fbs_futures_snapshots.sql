-- Weekly snapshots of the FBS futures model (conference title sim), the G5
-- playoff sim, and the books' national-title outrights, so odds and
-- projections can be watched week over week. One row per team per source
-- per week; market rows are one per team per book. Run in the Supabase SQL
-- editor. No RLS, per app pattern.

create table if not exists fbs_futures_snapshots (
  id bigserial primary key,
  season integer not null,
  week integer not null,               -- completed CFB weeks at capture time
  taken_at timestamptz not null default now(),
  source text not null,                -- 'futures' | 'g5' | 'market'
  conference text,
  team_name text not null,             -- canonical FBS team name
  rating numeric,
  wins integer,
  losses integer,
  proj_wins numeric,
  proj_losses numeric,
  title_prob numeric,                  -- futures: regular-season conference title
  ccg_prob numeric,                    -- futures: wins the conference championship game
  top2_prob numeric,                   -- futures: reaches the title game
  champ_prob numeric,                  -- g5: wins its conference (title game included)
  playoff_prob numeric,                -- g5: takes the G5 playoff spot
  fair_odds integer,                   -- fair American on the headline probability
  timing_signal text,                  -- market-timing badge at capture
  market_book text,                    -- market rows: bookmaker key
  market_odds integer,                 -- market rows: national-title outright, American
  market_prob numeric,                 -- market rows: implied prob after removing the book's hold
  games_started integer not null default 0  -- games of the NEXT week already under way at capture (0 = clean)
);

create unique index if not exists fbs_futures_snapshots_uniq
  on fbs_futures_snapshots (season, week, source, team_name, coalesce(market_book, ''));

create index if not exists fbs_futures_snapshots_team
  on fbs_futures_snapshots (season, team_name, week);

-- Already created the table before games_started existed? Add the column:
alter table fbs_futures_snapshots add column if not exists games_started integer not null default 0;
