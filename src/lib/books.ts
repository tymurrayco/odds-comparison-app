// src/lib/books.ts
//
// THE one config file for sportsbooks on odds.day: slug, display title, Odds
// API key, home/affiliate URLs, deep-link host allowlist, legal states, logo.
// Everything that turns a price on the board into a click-out goes through
// `goUrl()` here → /go/[book] (src/app/go/[book]/route.ts), which validates
// the `to` deep link against `domains`, logs the click to book_clicks and 302s.
//
// Plain module (no 'use client', no imports) so both the route handler and the
// client tables can use it.
//
// TODO: the 7 per-component logo maps still hard-code '/bookmaker-logos/*.png'
// keyed by title. Replace them with bookByTitle(title)?.logo in a later pass:
//   src/components/BookmakerSelector.tsx
//   src/components/OddsTable.tsx
//   src/components/PropsTable.tsx
//   src/components/FuturesTable.tsx
//   src/components/MyBets.tsx
//   src/app/api/og-bet/route.tsx
//   src/app/api/og-futures/route.tsx

/** 'ALL' = available nationwide; 'OFFSHORE' = not licensed in any US state. */
export type BookStates = string[] | 'ALL' | 'OFFSHORE';

export interface BookConfig {
  /** URL-safe id used in /go/[slug] and the book_clicks.book column. */
  slug: string;
  /** Display title — MUST match BOOKMAKERS in src/lib/api.ts exactly (odds rows are keyed by it). */
  title: string;
  /** the-odds-api bookmaker key (Kalshi is our own feed, see /api/kalshi-odds). */
  oddsApiKey: string;
  /** Public homepage — the fallback destination when a click has no deep link. */
  homeUrl: string;
  /** Affiliate landing URL. When set it REPLACES homeUrl for non-deep-link clicks. Tyler fills in. */
  affiliateUrl: string | null;
  /** Query params appended to every allowed deep link (e.g. { wpcid: '...' }). Tyler fills in. */
  affiliateParams: Record<string, string>;
  /** Base domains a deep link for this book may point to (exact host or any subdomain). */
  domains: string[];
  /** US states where the book legally operates online. See the PLACEHOLDER warning below. */
  states: BookStates;
  /** File under /public/bookmaker-logos. */
  logo: string;
}

// ⚠️ PLACEHOLDER — Tyler to verify before geo-gating goes live.
// The `states` lists below are a best-effort snapshot as of 2026 from memory,
// not from the books' own licence pages. Nothing reads them yet (the /go route
// logs the visitor's state but never blocks on it). Check each one against
// the operator's current state list before any state-aware behaviour ships.
// Known soft spots: Missouri launches (Dec 2025), Novig/ProphetX sweepstakes
// vs. real-money footprints, Kalshi's state cease-and-desist disputes.
export const BOOKS: BookConfig[] = [
  {
    slug: 'draftkings',
    title: 'DraftKings',
    oddsApiKey: 'draftkings',
    homeUrl: 'https://sportsbook.draftkings.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // Odds API links: sportsbook.draftkings.com/event/... and dksb.sng.link/... (Singular attribution links)
    domains: ['draftkings.com', 'dksb.sng.link'],
    states: ['AZ', 'CO', 'CT', 'DC', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MO', 'NH', 'NJ', 'NY', 'NC', 'OH', 'OR', 'PA', 'TN', 'VT', 'VA', 'WV', 'WY'],
    logo: 'draftkings.png',
  },
  {
    slug: 'fanduel',
    title: 'FanDuel',
    oddsApiKey: 'fanduel',
    homeUrl: 'https://sportsbook.fanduel.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // sportsbook.fanduel.com/... and account.sportsbook.fanduel.com/sportsbook/addToBetslip?...
    domains: ['fanduel.com'],
    states: ['AZ', 'CO', 'CT', 'DC', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'MD', 'MA', 'MI', 'MO', 'NJ', 'NY', 'NC', 'OH', 'PA', 'TN', 'VT', 'VA', 'WV', 'WY'],
    logo: 'fd.png',
  },
  {
    slug: 'betmgm',
    title: 'BetMGM',
    oddsApiKey: 'betmgm',
    homeUrl: 'https://sports.betmgm.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // sports.{state}.betmgm.com/en/sports/... — any *.betmgm.com host
    domains: ['betmgm.com'],
    states: ['AZ', 'CO', 'DC', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'MD', 'MA', 'MI', 'MO', 'NV', 'NJ', 'NY', 'NC', 'OH', 'PA', 'TN', 'VA', 'WV', 'WY'],
    logo: 'betmgm.png',
  },
  {
    slug: 'betrivers',
    title: 'BetRivers',
    oddsApiKey: 'betrivers',
    homeUrl: 'https://www.betrivers.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // {state}.betrivers.com/?page=sportsbook... — any *.betrivers.com host
    domains: ['betrivers.com'],
    states: ['AZ', 'CO', 'IL', 'IN', 'IA', 'LA', 'MD', 'MI', 'MO', 'NJ', 'NY', 'OH', 'PA', 'VA', 'WV'],
    logo: 'betrivers.png',
  },
  {
    slug: 'caesars',
    title: 'Caesars',
    oddsApiKey: 'williamhill_us',
    homeUrl: 'https://sportsbook.caesars.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // sportsbook.caesars.com/us/{state}/bet/... — any *.caesars.com host
    domains: ['caesars.com'],
    states: ['AZ', 'CO', 'DC', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MO', 'NV', 'NJ', 'NY', 'NC', 'OH', 'PA', 'TN', 'VA', 'WV', 'WY'],
    logo: 'caesars.png',
  },
  {
    slug: 'betonline',
    title: 'BetOnline.ag',
    oddsApiKey: 'betonlineag',
    homeUrl: 'https://www.betonline.ag/sportsbook',
    affiliateUrl: null,
    affiliateParams: {},
    domains: ['betonline.ag'],
    // Offshore book — not licensed in any US state. Never sends deep links.
    states: 'OFFSHORE',
    logo: 'betonline.png',
  },
  {
    slug: 'kalshi',
    title: 'Kalshi',
    oddsApiKey: 'kalshi', // not an Odds API book — own feed (src/lib/kalshi.ts)
    homeUrl: 'https://kalshi.com/',
    affiliateUrl: null,
    affiliateParams: {},
    domains: ['kalshi.com'],
    // CFTC-regulated federal exchange, so nominally nationwide — but several
    // states (NV, NJ, MD, MA, OH among others) have disputed sports contracts
    // via cease-and-desist letters / litigation. Treat 'ALL' as contested.
    states: 'ALL',
    logo: 'kalshi.png',
  },
  {
    slug: 'novig',
    title: 'Novig',
    oddsApiKey: 'novig',
    homeUrl: 'https://novig.com/',
    affiliateUrl: null,
    affiliateParams: {},
    // novig.com/event-markets/... (src/lib/novig.ts) plus app.novig.com / *.novig.us
    domains: ['novig.com', 'novig.us'],
    // Peer-to-peer exchange on a sweepstakes model: available in most states,
    // typically EXCLUDING ID, MI, NV, WA (+ a few others). Best-effort list of
    // the larger markets it serves — verify against novig.com before use.
    states: ['AZ', 'CA', 'CO', 'FL', 'GA', 'IL', 'IN', 'MA', 'MN', 'MO', 'NJ', 'NY', 'NC', 'OH', 'OR', 'PA', 'TN', 'TX', 'VA', 'WI'],
    logo: 'novig.png',
  },
  {
    slug: 'prophetx',
    title: 'ProphetX',
    oddsApiKey: 'prophetx',
    homeUrl: 'https://www.prophetx.co/',
    affiliateUrl: null,
    affiliateParams: {},
    // app.prophetx.co/... universal links (see APP_LINK_HOSTS in betLinks.ts)
    domains: ['prophetx.co'],
    // Sweepstakes-model exchange; Prophet Exchange's real-money licence was NJ.
    // Roughly ten states per Tyler's notes — list below is a guess, verify.
    states: ['AZ', 'CA', 'CO', 'FL', 'IL', 'NJ', 'NY', 'PA', 'TX', 'VA'],
    logo: 'prophetx.png',
  },
];

const BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));
const BY_TITLE = new Map(BOOKS.map((b) => [b.title, b]));
const BY_ODDS_KEY = new Map(BOOKS.map((b) => [b.oddsApiKey, b]));

export function bookBySlug(slug: string): BookConfig | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

export function bookByTitle(title: string): BookConfig | undefined {
  return BY_TITLE.get(title);
}

export function bookByOddsApiKey(key: string): BookConfig | undefined {
  return BY_ODDS_KEY.get(key);
}

/** Title OR slug → config (the tables key rows by title, the route by slug). */
export function resolveBook(bookOrSlug: string): BookConfig | undefined {
  return bookByTitle(bookOrSlug) ?? bookBySlug(bookOrSlug);
}

/** True when `host` is one of `domains` or a subdomain of one. */
export function hostAllowed(host: string, domains: string[]): boolean {
  const h = host.toLowerCase();
  return domains.some((d) => h === d || h.endsWith(`.${d}`));
}

export interface GoUrlParams {
  /** Book title ('DraftKings') or slug ('draftkings'). */
  book: string;
  /** Resolved deep link (templates already filled). Omit for a home/affiliate click. */
  to?: string;
  sport?: string;
  game?: string;
  market?: string;
  outcome?: string;
}

/** Site-relative click-out URL: /go/draftkings?to=...&sport=...&game=...&market=...&outcome=... */
export function goUrl({ book, to, sport, game, market, outcome }: GoUrlParams): string {
  const slug = resolveBook(book)?.slug ?? book.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = new URLSearchParams();
  if (to) q.set('to', to);
  if (sport) q.set('sport', sport);
  if (game) q.set('game', game);
  if (market) q.set('market', market);
  if (outcome) q.set('outcome', outcome);
  const qs = q.toString();
  return `/go/${slug}${qs ? `?${qs}` : ''}`;
}
