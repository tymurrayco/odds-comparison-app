// src/lib/sportSlugs.ts
//
// URL slug ↔ Odds API sport key for the server-rendered sport pages
// (/nfl, /nba, ...). Only ACTIVE leagues (src/lib/api.ts LEAGUES) get a page;
// the slug list is derived so flipping isActive adds/removes the URL too.
// Plain module (no browser globals) — used by the page, the board, the
// league nav, the sitemap and middleware.

import { LEAGUES } from './api';

const SLUG_BY_KEY: Record<string, string> = {
  americanfootball_nfl: 'nfl',
  americanfootball_nfl_preseason: 'nfl-preseason',
  americanfootball_ncaaf: 'ncaaf',
  americanfootball_cfl: 'cfl',
  basketball_nba: 'nba',
  basketball_ncaab: 'ncaab',
  basketball_wnba: 'wnba',
  baseball_mlb: 'mlb',
  baseball_ncaa: 'college-baseball',
  icehockey_nhl: 'nhl',
  soccer_usa_mls: 'mls',
  soccer_epl: 'epl',
  lacrosse_ncaa: 'lacrosse',
};

export interface SportPage {
  slug: string;
  key: string;   // Odds API sport key
  name: string;  // "NFL"
}

/** Active leagues that have a /[slug] page, in nav order. */
export const SPORT_PAGES: SportPage[] = LEAGUES
  .filter((l) => l.isActive && SLUG_BY_KEY[l.id])
  .map((l) => ({ slug: SLUG_BY_KEY[l.id], key: l.id, name: l.name }));

export function sportBySlug(slug: string): SportPage | undefined {
  return SPORT_PAGES.find((s) => s.slug === slug.toLowerCase());
}

export function slugForSportKey(key: string): string | undefined {
  return SPORT_PAGES.find((s) => s.key === key)?.slug;
}

/** Site-relative URL for a league: /nfl for a page league, /?league= otherwise. */
export function urlForSportKey(key: string): string {
  const slug = slugForSportKey(key);
  return slug ? `/${slug}` : `/?league=${encodeURIComponent(key)}`;
}

// Long names for titles / headings
const LONG_NAMES: Record<string, string> = {
  nfl: 'NFL',
  nba: 'NBA',
  mlb: 'MLB',
  nhl: 'NHL',
  ncaaf: 'College Football',
  ncaab: 'College Basketball',
  mls: 'MLS',
  cfl: 'CFL',
  wnba: 'WNBA',
  epl: 'Premier League',
};

export function sportLongName(slug: string): string {
  return LONG_NAMES[slug] ?? slug.toUpperCase();
}
