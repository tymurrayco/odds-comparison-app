-- NFL totals Ledger: fundamentals (pace + points per play from
-- football_game_stats) + a per-team market term moved by closing totals.
-- Run in the Supabase SQL editor (normal run, not "with RLS").

create table if not exists nfl_totals_ratings (
  team_name text not null,            -- = nfl_ratings.team_name
  espn_id text,
  espn_abbr text,
  season integer not null,
  prior_pace numeric not null,        -- prior-season plays/game, regressed to league avg
  prior_off_ppp numeric not null,     -- prior-season points per play, regressed
  prior_def_ppp numeric not null,     -- prior-season points per play ALLOWED, regressed
  market_term numeric not null default 0,   -- points the market adds to this team's games
  initial_market_term numeric not null default 0, -- seed fit vs preseason totals
  games_processed integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_name, season)
);

create table if not exists nfl_totals_adjustments (
  game_id text primary key,           -- ESPN event id (same as nfl_game_adjustments)
  odds_api_id text,
  game_date timestamptz not null,
  home_team text not null,
  away_team text not null,
  is_neutral_site boolean not null default false,
  -- fundamentals snapshot the game was priced under (blended, as of game date)
  home_pace numeric not null, home_off_ppp numeric not null, home_def_ppp numeric not null, home_stat_games integer not null,
  away_pace numeric not null, away_off_ppp numeric not null, away_def_ppp numeric not null, away_stat_games integer not null,
  plays_expected numeric not null,
  home_pts_fund numeric not null,
  away_pts_fund numeric not null,
  fund_total numeric not null,
  home_term_before numeric not null,
  away_term_before numeric not null,
  projected_total numeric not null,
  closing_total numeric not null,
  closing_source text,
  difference numeric not null,        -- closing - projected
  adjustment numeric not null,        -- difference / 2, added to BOTH teams (not zero-sum)
  home_term_after numeric not null,
  away_term_after numeric not null,
  season integer not null,
  processed_at timestamptz not null default now()
);
create index if not exists nfl_totals_adjustments_date_idx
  on nfl_totals_adjustments (season, game_date);

create table if not exists nfl_totals_config (
  id integer primary key,
  season integer not null,
  league_avg_pace numeric not null default 61.5,
  league_avg_ppp numeric not null default 0.374,
  blend_k numeric not null default 4,          -- stats weight = games / (games + k)
  prior_regress numeric not null default 0.3333, -- prior-season numbers pulled this far toward league avg
  seed_label text,
  last_processed_date date,
  updated_at timestamptz not null default now()
);
insert into nfl_totals_config (id, season) values (1, 2026) on conflict (id) do nothing;

-- Closing totals ride along in the spread sync's per-game line cache
alter table nfl_closing_lines add column if not exists closing_total numeric;
