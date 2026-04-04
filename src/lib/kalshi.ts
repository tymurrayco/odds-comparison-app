// src/lib/kalshi.ts
// Kalshi public API client for fetching sports market odds.
// No authentication needed — market data endpoints are public.

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Maps the-odds-api sport keys to Kalshi series tickers (used to query /events endpoint)
const SPORT_TO_KALSHI_SERIES: Record<string, string[]> = {
  'baseball_mlb': ['KXMLBGAME'],
  'basketball_nba': ['KXNBAGAME'],
  'basketball_ncaab': ['KXNCAAMBGAME'],
  'icehockey_nhl': ['KXNHLGAME'],
  'soccer_epl': ['KXEPLGAME'],
  'americanfootball_nfl': ['KXNFLGAME'],
  'americanfootball_ncaaf': ['KXNCAAFBGAME'],
};

// Kalshi market as returned from the API (fields we care about)
interface KalshiMarketRaw {
  ticker: string;
  event_ticker: string;
  title: string;
  status: string;
  yes_sub_title: string;   // Team/city name, e.g. "Detroit"
  no_sub_title: string;
  last_price_dollars: string;
  yes_bid_dollars: string;
  yes_ask_dollars: string;
  expected_expiration_time: string | null;
  close_time: string;
  volume_fp: string;
}

// A resolved game with both sides' odds
export interface KalshiGameOdds {
  eventTicker: string;
  title: string;          // e.g. "Detroit at Philadelphia Winner?"
  awayTeam: string;       // Parsed from title
  homeTeam: string;       // Parsed from title
  awayOdds: number;       // American moneyline
  homeOdds: number;       // American moneyline
  commenceTime: string;   // ISO string (estimated from expected_expiration_time)
}

/**
 * Convert a Kalshi YES price (0.00-1.00 dollars) to American moneyline.
 * Ported from kalshi-sportsbot/odds_fetcher.py price_to_ml()
 */
function priceToML(priceDollars: number): number {
  if (priceDollars <= 0 || priceDollars >= 1) return 0;
  if (priceDollars <= 0.5) {
    // Underdog: positive odds
    return Math.round((1 / priceDollars - 1) * 100);
  } else {
    // Favorite: negative odds
    return Math.round(-(priceDollars / (1 - priceDollars)) * 100);
  }
}

/**
 * Parse "Away at/vs Home Winner?" title to extract team names.
 */
function parseTitle(title: string): { away: string; home: string } | null {
  // NBA/NHL/NCAAB: "Detroit at Philadelphia Winner?"
  // MLB: "Philadelphia vs San Francisco Winner?"
  const match = title.match(/^(.+?)\s+(?:at|vs)\s+(.+?)(?:\s+Winner\??)?$/i);
  if (match) {
    return { away: match[1].trim(), home: match[2].trim() };
  }
  return null;
}

/**
 * Group markets by event and build game odds.
 * Each event has 2 markets (one per team). We pair them up.
 */
function buildGameOdds(marketsByEvent: Map<string, KalshiMarketRaw[]>): KalshiGameOdds[] {
  const games: KalshiGameOdds[] = [];

  for (const [eventTicker, markets] of marketsByEvent) {
    if (markets.length < 2) continue;

    // Parse team names from title
    const parsed = parseTitle(markets[0].title);
    if (!parsed) continue;

    // Extract away/home team abbreviations from event ticker.
    // Format: KXSPORT-26APR06AWYHME -> last segment has away+home abbrevs
    // Each market ticker ends with -ABBREV matching one team.
    // We match by checking if the event ticker (lowercased) ends with the market's suffix.
    const etLower = eventTicker.toLowerCase();

    let awayPrice: number | null = null;
    let homePrice: number | null = null;
    let awayName = parsed.away;
    let homeName = parsed.home;
    let commenceTime = '';

    for (const m of markets) {
      const price = parseFloat(m.last_price_dollars);
      if (isNaN(price) || price <= 0 || price >= 1) continue;

      // Market ticker suffix is the team abbreviation (e.g., "NSH", "LA", "DEN")
      const marketSuffix = m.ticker.split('-').pop()?.toLowerCase() || '';

      // Check if this market's team abbreviation appears at the START of the
      // event ticker's team portion (away team) or END (home team).
      // Event ticker team portion: e.g., "nshla" from KXNHLGAME-26APR06NSHLA
      // Away team abbrev comes first, home team abbrev comes second.
      const teamPortion = etLower.replace(/^.*\d{2}/, ''); // strip prefix up to date digits

      if (teamPortion.startsWith(marketSuffix)) {
        awayPrice = price;
        awayName = m.yes_sub_title;
      } else if (teamPortion.endsWith(marketSuffix)) {
        homePrice = price;
        homeName = m.yes_sub_title;
      }

      if (!commenceTime && m.expected_expiration_time) {
        const endTime = new Date(m.expected_expiration_time);
        const startTime = new Date(endTime.getTime() - 3 * 60 * 60 * 1000);
        commenceTime = startTime.toISOString();
      }
    }

    if (awayPrice === null || homePrice === null) continue;

    games.push({
      eventTicker,
      title: markets[0].title,
      awayTeam: awayName,
      homeTeam: homeName,
      awayOdds: priceToML(awayPrice),
      homeOdds: priceToML(homePrice),
      commenceTime,
    });
  }

  return games;
}

/**
 * Main entry point: fetch Kalshi odds for a given sport key.
 * Returns game odds with American moneylines, ready for merging with the-odds-api data.
 */
export async function fetchKalshiOdds(sportKey: string): Promise<KalshiGameOdds[]> {
  const seriesTickers = SPORT_TO_KALSHI_SERIES[sportKey];
  if (!seriesTickers) return [];

  // Fetch events with nested markets in one call per series ticker
  const marketsByEvent = new Map<string, KalshiMarketRaw[]>();

  for (const series of seriesTickers) {
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        status: 'open',
        series_ticker: series,
        with_nested_markets: 'true',
        limit: '100',
      });
      if (cursor) params.set('cursor', cursor);

      const resp = await fetch(`${KALSHI_API_BASE}/events?${params}`, { cache: 'no-store' });
      if (!resp.ok) break;

      const data = await resp.json();
      const events = data.events || [];
      for (const e of events) {
        const markets = e.markets || [];
        if (markets.length >= 2) {
          marketsByEvent.set(e.event_ticker, markets);
        }
      }

      if (!data.cursor || events.length === 0) break;
      cursor = data.cursor;
    }
  }

  if (marketsByEvent.size === 0) return [];

  return buildGameOdds(marketsByEvent);
}
