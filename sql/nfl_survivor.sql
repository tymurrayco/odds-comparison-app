-- NFL survivor contest picks (Splash x Polymarket 2026). One row per pick
-- slot; double-pick weeks use slots 1 and 2. Run in the Supabase SQL editor.
create table if not exists nfl_survivor_picks (
  season integer not null,
  week integer not null,
  slot integer not null default 1,
  team_name text not null,            -- ESPN displayName ("Kansas City Chiefs")
  updated_at timestamptz not null default now(),
  primary key (season, week, slot)
);
