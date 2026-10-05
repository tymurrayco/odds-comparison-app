-- Sportsbook click-outs. One row per visit to /go/[book]
-- (src/app/go/[book]/route.ts): which book, what the visitor clicked (sport /
-- game / market / outcome from the board), whether it carried a deep link,
-- where they came from and roughly what device/state. Written after the 302
-- is sent, so a failed insert never breaks the redirect. No RLS (project
-- convention; written with the service-role key).
-- Run in the Supabase SQL editor.
create table if not exists book_clicks (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  book text not null,                     -- slug from src/lib/books.ts (draftkings, fanduel, ...)
  sport text,                             -- Odds API sport key (americanfootball_nfl, ...)
  game_id text,                           -- Odds API event id (= Game.id)
  market text,                            -- h2h | spreads | spreads_h1 | totals | futures
  outcome text,                           -- team / "Over 45.5" / "Team +3.5"
  deep_link boolean not null default false, -- true = sent to a betslip/event link, false = home/affiliate page
  destination_host text,                  -- hostname actually redirected to
  state text,                             -- x-vercel-ip-country-region (null locally)
  country text,                           -- x-vercel-ip-country
  device text,                            -- mobile | tablet | desktop
  referrer text,                          -- Referer header, truncated to 500 chars
  user_agent text                         -- truncated to 300 chars
);
create index if not exists book_clicks_created_at on book_clicks (created_at desc);
create index if not exists book_clicks_book_created_at on book_clicks (book, created_at desc);
create index if not exists book_clicks_sport_created_at on book_clicks (sport, created_at desc);
