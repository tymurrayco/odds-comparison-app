-- Opening spreads for the game cards' line-move token. One row per Odds API
-- event: the first consensus spread the app saw (src/lib/lineOpeners.ts),
-- written by /api/odds whenever it fetches NFL/NCAAF lines plus a daily
-- cron. "Open" = first seen here, not the book's true opener.
-- Run in the Supabase SQL editor.
create table if not exists game_line_openers (
  event_id text primary key,              -- Odds API event id (= Game.id)
  sport_key text not null,
  home_team text not null,
  away_team text not null,
  commence_time timestamptz not null,
  home_spread numeric not null,           -- consensus across books, home perspective
  books integer not null,
  captured_at timestamptz not null default now()
);
create index if not exists game_line_openers_sport_time on game_line_openers (sport_key, commence_time);
