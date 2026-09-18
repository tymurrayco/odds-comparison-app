-- Weekly snapshots of the NFL futures model (division / conference / Super
-- Bowl sim) and the books' Super Bowl outrights, so odds and projections
-- can be watched week over week. Division and conference rows have no book
-- counterpart (the Odds API carries only the Super Bowl outright).
-- Run in the Supabase SQL editor. No RLS, per app pattern.

create table if not exists nfl_futures_snapshots (
  id bigserial primary key,
  season integer not null,
  week integer not null,               -- completed NFL weeks at capture time
  taken_at timestamptz not null default now(),
  source text not null,                -- 'futures' | 'market'
  division text,                       -- "AFC East"
  conference text,                     -- "AFC"
  team_name text not null,
  rating numeric,
  wins integer,
  losses integer,
  ties integer,
  proj_wins numeric,
  proj_losses numeric,
  div_prob numeric,
  playoff_prob numeric,
  seed1_prob numeric,
  conf_prob numeric,
  sb_prob numeric,
  div_odds integer,                    -- fair American on the division title
  timing_signal text,
  market_book text,                    -- market rows: bookmaker key
  market_odds integer,                 -- market rows: Super Bowl outright, American
  market_prob numeric,                 -- market rows: implied prob after removing the book's hold
  games_started integer not null default 0, -- games of the NEXT week already under way at capture (0 = clean)
  sos_pct numeric,                     -- futures rows: median-team win % over the full slate (lower = harder)
  sos_remaining_pct numeric            -- futures rows: same over unplayed games only
);

create unique index if not exists nfl_futures_snapshots_uniq
  on nfl_futures_snapshots (season, week, source, team_name, coalesce(market_book, ''));

create index if not exists nfl_futures_snapshots_team
  on nfl_futures_snapshots (season, team_name, week);

-- Already created the table before games_started existed? Add the column:
alter table nfl_futures_snapshots add column if not exists games_started integer not null default 0;
alter table nfl_futures_snapshots add column if not exists sos_pct numeric;
alter table nfl_futures_snapshots add column if not exists sos_remaining_pct numeric;
