// src/lib/kalshi.ts
// Kalshi public API client for fetching sports market odds.
// No authentication needed — market data endpoints are public.

const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// Maps the-odds-api sport keys to Kalshi series tickers for moneyline.
// NCAAB includes tournament-specific series (KXMARMAD for March Madness championship,
// KXNCAAMBCBC for College Basketball Crown) because Kalshi often doesn't create
// KXNCAAMBGAME events for Final Four / tournament games.
const SPORT_TO_KALSHI_MONEYLINE: Record<string, string[]> = {
  'baseball_mlb': ['KXMLBGAME'],
  'basketball_nba': ['KXNBAGAME'],
  'basketball_ncaab': ['KXNCAAMBGAME', 'KXMARMAD', 'KXNCAAMBCBC', 'KXNCAAMBNIT'],
  'icehockey_nhl': ['KXNHLGAME'],
  'soccer_epl': ['KXEPLGAME'],
  'americanfootball_nfl': ['KXNFLGAME'],
  'americanfootball_ncaaf': ['KXNCAAFBGAME'],
};

// Maps the-odds-api sport keys to Kalshi series tickers for spreads
const SPORT_TO_KALSHI_SPREAD: Record<string, string[]> = {
  'basketball_ncaab': ['KXNCAAMBSPREAD'],
  'basketball_nba': ['KXNBASPREAD'],
  'americanfootball_nfl': ['KXNFLSPREAD'],
  'americanfootball_ncaaf': ['KXNCAAFBSPREAD'],
  'baseball_mlb': ['KXMLBSPREAD'],
  'icehockey_nhl': ['KXNHLSPREAD'],
};

// Maps the-odds-api sport keys to Kalshi series tickers for totals (over/under)
const SPORT_TO_KALSHI_TOTAL: Record<string, string[]> = {
  'baseball_mlb': ['KXMLBTOTAL'],
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
  no_ask_dollars: string;
  expected_expiration_time: string | null;
  close_time: string;
  volume_fp: string;
  floor_strike?: number;   // Spread point value (for spread markets)
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

// A resolved spread with both sides
export interface KalshiSpreadOdds {
  eventTicker: string;
  title: string;
  awayTeam: string;
  homeTeam: string;
  awaySpread: number;     // e.g. +5.5
  homeSpread: number;     // e.g. -5.5
  awayPrice: number;      // American odds for the away spread
  homePrice: number;      // American odds for the home spread
  commenceTime: string;
}

// A resolved total with over/under
export interface KalshiTotalOdds {
  eventTicker: string;
  title: string;
  awayTeam: string;
  homeTeam: string;
  total: number;          // e.g. 8.5
  overPrice: number;      // American odds for over
  underPrice: number;     // American odds for under
  commenceTime: string;
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

/** Parse a dollar-price string into a usable probability (0 < p < 1), else null. */
function validPrice(raw: string | undefined): number | null {
  const p = parseFloat(raw ?? '');
  return !isNaN(p) && p > 0 && p < 1 ? p : null;
}

/**
 * The price a buyer actually pays for a side is the ASK. The bid is only what
 * a seller would receive — quoting bids overstated every Kalshi price (the two
 * sides of a game implied probabilities summing under 1, so Kalshi won "Best"
 * comparisons at prices no one could get).
 */
function buyYesPrice(m: KalshiMarketRaw): number | null {
  return validPrice(m.yes_ask_dollars) ?? validPrice(m.last_price_dollars);
}

function buyNoPrice(m: KalshiMarketRaw): number | null {
  // no_ask == 1 - yes_bid on Kalshi's book; prefer the field, derive as fallback
  const noAsk = validPrice(m.no_ask_dollars);
  if (noAsk !== null) return noAsk;
  const yesBid = validPrice(m.yes_bid_dollars);
  if (yesBid !== null) return 1 - yesBid;
  const last = validPrice(m.last_price_dollars);
  return last !== null ? 1 - last : null;
}

/** Bid/ask midpoint (fallback: last trade) — the market's consensus probability. */
function midPrice(m: KalshiMarketRaw): number | null {
  const bid = validPrice(m.yes_bid_dollars);
  const ask = validPrice(m.yes_ask_dollars);
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  return validPrice(m.last_price_dollars) ?? ask ?? bid;
}

/**
 * Parse game title to extract team names. Handles multiple formats:
 * - "Detroit at Philadelphia Winner?"  (regular game)
 * - "Philadelphia vs San Francisco Winner?"  (neutral site)
 * - "National Championship: Michigan vs UConn"  (tournament)
 * - "College Basketball Crown Final: Oklahoma vs West Virginia"  (tournament)
 */
function parseTitle(title: string): { away: string; home: string } | null {
  // Tournament format first: "Label: Team1 vs Team2" (check before standard to avoid
  // the standard regex eating the label prefix as a team name)
  if (title.includes(':')) {
    const tournMatch = title.match(/:\s+(.+?)\s+vs\.?\s+(.+?)$/i);
    if (tournMatch) {
      return { away: tournMatch[1].trim(), home: tournMatch[2].trim() };
    }
  }
  // Standard format: "Away at/vs Home Winner?"
  const stdMatch = title.match(/^(.+?)\s+(?:at|vs)\s+(.+?)(?:\s+Winner\??)?$/i);
  if (stdMatch) {
    return { away: stdMatch[1].trim(), home: stdMatch[2].trim() };
  }
  return null;
}


/**
 * Group markets by event and build game odds.
 * Handles two event formats:
 * 1. Standard game events (KXNCAAMBGAME-26APR06AWYHME) — 2 markets, team abbrevs in ticker
 * 2. Tournament events (KXMARMAD-26, KXNCAAMBCBC-26) — many markets but only 2 active,
 *    team names from yes_sub_title matched against parsed title
 */
function buildGameOdds(marketsByEvent: Map<string, KalshiMarketRaw[]>): KalshiGameOdds[] {
  const games: KalshiGameOdds[] = [];

  for (const [eventTicker, markets] of marketsByEvent) {
    // For tournament events (e.g., KXMARMAD), filter to only active markets
    const activeMarkets = markets.filter(m => m.status === 'active');
    const workingMarkets = activeMarkets.length >= 2 ? activeMarkets : markets;
    if (workingMarkets.length < 2) continue;

    // Try to parse title from the first market, or from the event title embedded in markets
    // Tournament events have titles like "Will Michigan win..." — use the event title instead
    let parsed: { away: string; home: string } | null = null;

    // First try the standard game title format from market title
    parsed = parseTitle(workingMarkets[0].title);

    // If that fails, check if this is a tournament event — look for team names in yes_sub_title
    if (!parsed && workingMarkets.length === 2) {
      // Tournament events: use yes_sub_title as team names (order: first listed = away)
      const team1 = workingMarkets[0].yes_sub_title;
      const team2 = workingMarkets[1].yes_sub_title;
      if (team1 && team2) {
        parsed = { away: team1, home: team2 };
      }
    }

    if (!parsed) continue;

    const etLower = eventTicker.toLowerCase();
    // Extract team portion from ticker (only works for standard game events)
    const teamPortion = etLower.replace(/^.*\d{2}/, '');

    let awayPrice: number | null = null;
    let homePrice: number | null = null;
    let awayName = parsed.away;
    let homeName = parsed.home;
    let commenceTime = '';

    for (const m of workingMarkets) {
      // Each team's market is priced by what it costs to BUY that team's YES
      const price = buyYesPrice(m);
      if (price === null) continue;

      const marketSuffix = m.ticker.split('-').pop()?.toLowerCase() || '';

      // Method 1: Match by ticker team portion (standard game events)
      if (teamPortion && teamPortion.length > 2) {
        if (teamPortion.startsWith(marketSuffix)) {
          awayPrice = price;
          awayName = m.yes_sub_title;
        } else if (teamPortion.endsWith(marketSuffix)) {
          homePrice = price;
          homeName = m.yes_sub_title;
        }
      }

      // Method 2: Match by yes_sub_title against parsed title (tournament events)
      if (awayPrice === null && homePrice === null) {
        const sub = m.yes_sub_title.toLowerCase();
        if (parsed.away.toLowerCase().includes(sub) || sub.includes(parsed.away.toLowerCase())) {
          awayPrice = price;
          awayName = m.yes_sub_title;
        } else if (parsed.home.toLowerCase().includes(sub) || sub.includes(parsed.home.toLowerCase())) {
          homePrice = price;
          homeName = m.yes_sub_title;
        }
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
      title: workingMarkets[0].title,
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
 * Build spread odds from spread markets.
 * Each spread event has multiple markets at different strike points for each team.
 * We find the "consensus" spread — the strike where the bid/ask midpoint is closest
 * to 0.50 (even money), which represents the market's best estimate of the true spread.
 * Both sides are derived from a single market: YES = favorite covers, NO = underdog
 * covers — each priced at its own ask (what a buyer pays).
 */
function buildSpreadOdds(marketsByEvent: Map<string, KalshiMarketRaw[]>): KalshiSpreadOdds[] {
  const spreads: KalshiSpreadOdds[] = [];

  for (const [eventTicker, markets] of marketsByEvent) {
    const activeMarkets = markets.filter(m => m.status === 'active');
    if (activeMarkets.length < 2) continue;

    const etLower = eventTicker.toLowerCase();
    const teamPortion = etLower.replace(/^.*\d{2}/, '');

    let awayTeam = '';
    let homeTeam = '';
    let commenceTime = '';

    // Collect all spread markets with their team assignment
    interface SpreadEntry {
      teamName: string;
      strike: number;
      buyYes: number;     // cost to buy YES (favorite covers), 0-1
      buyNo: number;      // cost to buy NO (underdog covers), 0-1
      mid: number;        // bid/ask midpoint, used for consensus-line selection
      isAway: boolean;
    }
    const entries: SpreadEntry[] = [];

    for (const m of activeMarkets) {
      const strike = m.floor_strike;
      if (strike === undefined || strike === null) continue;

      const buyYes = buyYesPrice(m);
      const buyNo = buyNoPrice(m);
      const mid = midPrice(m);
      if (buyYes === null || buyNo === null || mid === null) continue;

      const marketSuffix = m.ticker.split('-').pop()?.toLowerCase() || '';
      const teamAbbrev = marketSuffix.replace(/\d+$/, '');

      const isAway = teamPortion.startsWith(teamAbbrev);
      const isHome = teamPortion.endsWith(teamAbbrev);
      if (!isAway && !isHome) continue;

      const teamMatch = m.title?.match(/^(.+?)\s+wins\s+by/i);
      const teamName = teamMatch ? teamMatch[1].trim() : m.yes_sub_title;

      if (isAway && !awayTeam) awayTeam = teamName;
      if (isHome && !homeTeam) homeTeam = teamName;

      entries.push({ teamName, strike, buyYes, buyNo, mid, isAway });

      if (!commenceTime && m.expected_expiration_time) {
        const endTime = new Date(m.expected_expiration_time);
        const startTime = new Date(endTime.getTime() - 3 * 60 * 60 * 1000);
        commenceTime = startTime.toISOString();
      }
    }

    if (!awayTeam || !homeTeam) continue;

    // Find the consensus spread: the market whose bid/ask midpoint is closest to
    // 0.50. "Team wins by over X" at ~0.50 means the market thinks the true spread is ~X.
    let bestEntry: SpreadEntry | null = null;
    let bestDistFrom50 = Infinity;

    for (const e of entries) {
      const dist = Math.abs(e.mid - 0.50);
      if (dist < bestDistFrom50) {
        bestDistFrom50 = dist;
        bestEntry = e;
      }
    }

    if (!bestEntry) continue;

    // Derive both sides from the consensus market:
    // "Team A wins by over X" YES = Team A -X, NO = Team B +X
    // Each side priced at its ask — what a buyer pays
    const favoriteSpread = -bestEntry.strike;
    const underdogSpread = bestEntry.strike;
    const favoriteOdds = priceToML(bestEntry.buyYes);
    const underdogOdds = priceToML(bestEntry.buyNo);

    let homeSpread: number, awaySpread: number, homePrice: number, awayPrice: number;

    if (bestEntry.isAway) {
      // Away team is the favorite (they "win by over X")
      awaySpread = favoriteSpread;
      homeSpread = underdogSpread;
      awayPrice = favoriteOdds;
      homePrice = underdogOdds;
    } else {
      // Home team is the favorite
      homeSpread = favoriteSpread;
      awaySpread = underdogSpread;
      homePrice = favoriteOdds;
      awayPrice = underdogOdds;
    }

    spreads.push({
      eventTicker,
      title: `${awayTeam} at ${homeTeam}: Spread`,
      awayTeam,
      homeTeam,
      awaySpread,
      homeSpread,
      awayPrice,
      homePrice,
      commenceTime,
    });
  }

  return spreads;
}

/**
 * Build totals odds from Kalshi total markets.
 * Each event has ~11 markets at different strike points (floor_strike = line, e.g. 8.5).
 * YES = over the line, NO = under. We pick the "main line" — the strike whose bid/ask
 * midpoint is closest to 0.50 — then price each side at its own ask, matching buildSpreadOdds.
 */
function buildTotalsOdds(marketsByEvent: Map<string, KalshiMarketRaw[]>): KalshiTotalOdds[] {
  const totals: KalshiTotalOdds[] = [];

  for (const [eventTicker, markets] of marketsByEvent) {
    const activeMarkets = markets.filter(m => m.status === 'active');
    if (activeMarkets.length < 1) continue;

    // Parse team names from market title, e.g. "Toronto vs Arizona Total Runs?"
    // Kalshi uses "vs" for both home/away and neutral — order matches ticker (away first).
    let awayTeam = '';
    let homeTeam = '';
    for (const m of activeMarkets) {
      const match = m.title?.match(/^(.+?)\s+(?:at|vs)\s+(.+?)\s+Total\s+Runs\??$/i);
      if (match) {
        awayTeam = match[1].trim();
        homeTeam = match[2].trim();
        break;
      }
    }
    if (!awayTeam || !homeTeam) continue;

    interface TotalEntry {
      line: number;
      buyYes: number;     // cost to buy YES (over), 0-1
      buyNo: number;      // cost to buy NO (under), 0-1
      mid: number;        // bid/ask midpoint, used for main-line selection
    }
    const entries: TotalEntry[] = [];
    let commenceTime = '';

    for (const m of activeMarkets) {
      const line = m.floor_strike;
      if (line === undefined || line === null) continue;

      const buyYes = buyYesPrice(m);
      const buyNo = buyNoPrice(m);
      const mid = midPrice(m);
      if (buyYes === null || buyNo === null || mid === null) continue;

      entries.push({ line, buyYes, buyNo, mid });

      if (!commenceTime && m.expected_expiration_time) {
        const endTime = new Date(m.expected_expiration_time);
        const startTime = new Date(endTime.getTime() - 3 * 60 * 60 * 1000);
        commenceTime = startTime.toISOString();
      }
    }

    if (entries.length === 0) continue;

    // Main line: bid/ask midpoint closest to 0.50 = market's consensus line
    let bestEntry: TotalEntry | null = null;
    let bestDistFrom50 = Infinity;
    for (const e of entries) {
      const dist = Math.abs(e.mid - 0.50);
      if (dist < bestDistFrom50) {
        bestDistFrom50 = dist;
        bestEntry = e;
      }
    }
    if (!bestEntry) continue;

    totals.push({
      eventTicker,
      title: `${awayTeam} at ${homeTeam}: Total`,
      awayTeam,
      homeTeam,
      total: bestEntry.line,
      overPrice: priceToML(bestEntry.buyYes),
      underPrice: priceToML(bestEntry.buyNo),
      commenceTime,
    });
  }

  return totals;
}

/**
 * Fetch events from a single Kalshi series ticker.
 * Tries status=open first, falls back to unfiltered if no results.
 */
async function fetchSeriesEvents(series: string): Promise<Map<string, KalshiMarketRaw[]>> {
  const result = new Map<string, KalshiMarketRaw[]>();

  // First try with status=open
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
      const markets = (e.markets || []) as KalshiMarketRaw[];
      if (markets.length >= 2) {
        result.set(e.event_ticker, markets);
      }
    }

    if (!data.cursor || events.length === 0) break;
    cursor = data.cursor;
  }

  // If status=open returned nothing, retry without status filter
  // (some series have empty event status but active markets)
  if (result.size === 0) {
    cursor = undefined;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
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
        const markets = (e.markets || []) as KalshiMarketRaw[];
        const activeMarkets = markets.filter(m => m.status === 'active');
        if (activeMarkets.length >= 2) {
          result.set(e.event_ticker, activeMarkets);
        }
      }

      if (!data.cursor || events.length === 0) break;
      cursor = data.cursor;
    }
  }

  return result;
}

/**
 * Fetch events from Kalshi for a list of series tickers.
 * Each series is fetched independently (with its own fallback logic).
 */
async function fetchEventMarkets(seriesTickers: string[]): Promise<Map<string, KalshiMarketRaw[]>> {
  const results = await Promise.all(seriesTickers.map(s => fetchSeriesEvents(s)));
  const combined = new Map<string, KalshiMarketRaw[]>();
  for (const map of results) {
    for (const [k, v] of map) {
      combined.set(k, v);
    }
  }
  return combined;
}

/**
 * Main entry point: fetch Kalshi odds for a given sport key.
 * Returns game odds with American moneylines and spread data,
 * ready for merging with the-odds-api data.
 */
export async function fetchKalshiOdds(sportKey: string): Promise<{
  moneyline: KalshiGameOdds[];
  spreads: KalshiSpreadOdds[];
  totals: KalshiTotalOdds[];
}> {
  const mlTickers = SPORT_TO_KALSHI_MONEYLINE[sportKey] || [];
  const spreadTickers = SPORT_TO_KALSHI_SPREAD[sportKey] || [];
  const totalTickers = SPORT_TO_KALSHI_TOTAL[sportKey] || [];

  // Fetch moneyline, spread, and total events in parallel
  const empty = new Map<string, KalshiMarketRaw[]>();
  const [mlMarkets, spreadMarkets, totalMarkets] = await Promise.all([
    mlTickers.length > 0 ? fetchEventMarkets(mlTickers) : Promise.resolve(empty),
    spreadTickers.length > 0 ? fetchEventMarkets(spreadTickers) : Promise.resolve(empty),
    totalTickers.length > 0 ? fetchEventMarkets(totalTickers) : Promise.resolve(empty),
  ]);

  return {
    moneyline: mlMarkets.size > 0 ? buildGameOdds(mlMarkets) : [],
    spreads: spreadMarkets.size > 0 ? buildSpreadOdds(spreadMarkets) : [],
    totals: totalMarkets.size > 0 ? buildTotalsOdds(totalMarkets) : [],
  };
}
