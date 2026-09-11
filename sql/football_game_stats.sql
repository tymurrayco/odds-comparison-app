-- Per-team, per-game box-score stats for the totals model (pace + points per
-- play). One row per team per game, both sides written from one ESPN event
-- summary. Serves every football league (league column) — NFL first.
-- Filled by POST /api/box-scores. Run this in the Supabase SQL editor.

create table if not exists football_game_stats (
  league text not null,               -- 'nfl' | 'ncaaf'
  game_id text not null,              -- ESPN event id
  team_espn_id text not null,
  team_name text not null,            -- ESPN displayName ("Kansas City Chiefs")
  opponent_espn_id text not null,
  opponent_name text not null,
  game_date timestamptz not null,
  season integer not null,
  season_type integer not null,       -- 1 preseason, 2 regular, 3 postseason
  is_home boolean not null,
  is_neutral boolean not null default false,
  points integer not null,
  opp_points integer not null,
  plays integer,                      -- offensive plays (NFL: totalOffensivePlays; CFB: pass att + rush att)
  total_yards integer,
  pass_attempts integer,
  rush_attempts integer,
  net_passing_yards integer,
  rushing_yards integer,
  first_downs integer,
  turnovers integer,
  possession_seconds integer,
  fetched_at timestamptz not null default now(),
  primary key (league, game_id, team_espn_id)
);

create index if not exists football_game_stats_team_idx
  on football_game_stats (league, season, team_espn_id, game_date);
