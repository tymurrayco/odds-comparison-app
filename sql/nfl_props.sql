-- sql/nfl_props.sql
-- NFL prop pricing: player game logs (from nflverse weekly stats) + derived
-- SD-multiplier reference snapshot. Run once in the Supabase SQL editor.
--
-- No RLS, matching power_rating_sets / eckel_snapshots — the app runs
-- anon-key-only. Covered by the existing auth audit item.

create table if not exists nfl_player_game_logs (
  id bigint generated always as identity primary key,
  player_id text not null,          -- nflverse GSIS id, e.g. 00-0036223
  player_name text not null,        -- display name, e.g. "Josh Jacobs"
  position text not null,           -- QB | RB | WR | TE | FB
  team text not null,
  opponent text,
  season int not null,
  week int not null,
  season_type text not null,        -- REG | POST
  completions real,
  attempts real,
  passing_yards real,
  passing_tds real,
  interceptions real,
  carries real,
  rushing_yards real,
  rushing_tds real,
  receptions real,
  targets real,
  receiving_yards real,
  receiving_tds real,
  created_at timestamptz not null default now(),
  unique (player_id, season, week, season_type)
);

create index if not exists idx_nfl_logs_player on nfl_player_game_logs (player_id);
create index if not exists idx_nfl_logs_name on nfl_player_game_logs (player_name);
create index if not exists idx_nfl_logs_season_pos on nfl_player_game_logs (season, position);

-- One JSONB snapshot row per reference recompute target (single 'default' row
-- in practice). reference = { seasons, computedAt, markets: { <marketKey>:
-- { positions: { <pos>: { overall, tiers[], meanAboveMedianPct } } } } }
create table if not exists nfl_prop_reference (
  key text primary key default 'default',
  seasons int[] not null,
  reference jsonb not null,
  computed_at timestamptz not null default now()
);
