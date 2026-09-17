-- NFL survivor: multiple entries (one per league), each with its own rules.
-- Run in the Supabase SQL editor AFTER sql/nfl_survivor.sql. Existing picks
-- stay put — they become entry 'main' (Splash x Polymarket).

alter table nfl_survivor_picks add column if not exists entry text not null default 'main';
alter table nfl_survivor_picks drop constraint if exists nfl_survivor_picks_pkey;
alter table nfl_survivor_picks add primary key (season, entry, week, slot);

create table if not exists nfl_survivor_entries (
  season integer not null,
  entry text not null,                       -- short key, e.g. 'main', 'league2'
  label text not null,                       -- shown in the UI
  double_pick_weeks integer[] not null default '{}',
  weeks integer not null default 18,
  created_at timestamptz not null default now(),
  primary key (season, entry)
);

insert into nfl_survivor_entries (season, entry, label, double_pick_weeks) values
  (2026, 'main',    'Splash × Polymarket', '{9,12,13,14,15,16}'),
  (2026, 'league2', 'League 2',            '{3,6,9,12,13,14,15,16}')
on conflict (season, entry) do nothing;
