// src/app/futures/[sport]/page.tsx
// Shareable futures link: serves an OG card of the market's top favorites,
// then redirects into the futures view on the main page.
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchKalshiFutures } from '@/lib/kalshi';

const SPORT_TO_CHAMPIONSHIP: { [key: string]: string } = {
  'basketball_nba': 'basketball_nba_championship_winner',
  'americanfootball_nfl': 'americanfootball_nfl_super_bowl_winner',
  'baseball_mlb': 'baseball_mlb_world_series_winner',
  'icehockey_nhl': 'icehockey_nhl_championship_winner',
  'basketball_ncaab': 'basketball_ncaab_championship_winner',
  'americanfootball_ncaaf': 'americanfootball_ncaaf_championship_winner',
  'soccer_epl': 'soccer_epl_winner',
};

const MARKET_TITLES: { [key: string]: string } = {
  'basketball_nba': 'NBA Championship',
  'americanfootball_nfl': 'Super Bowl Winner',
  'baseball_mlb': 'World Series Winner',
  'icehockey_nhl': 'Stanley Cup Winner',
  'basketball_ncaab': 'March Madness Winner',
  'americanfootball_ncaaf': 'CFP National Champion',
  'soccer_epl': 'EPL Winner',
  'basketball_wnba': 'WNBA Championship',
  'soccer_usa_mls': 'MLS Cup Winner',
};

const ESPN_LEAGUE_MAP: { [key: string]: { sport: string; league: string } } = {
  'americanfootball_nfl': { sport: 'football', league: 'nfl' },
  'americanfootball_ncaaf': { sport: 'football', league: 'college-football' },
  'basketball_nba': { sport: 'basketball', league: 'nba' },
  'basketball_ncaab': { sport: 'basketball', league: 'mens-college-basketball' },
  'icehockey_nhl': { sport: 'hockey', league: 'nhl' },
  'baseball_mlb': { sport: 'baseball', league: 'mlb' },
  'basketball_wnba': { sport: 'basketball', league: 'wnba' },
  'soccer_usa_mls': { sport: 'soccer', league: 'usa.1' },
  'soccer_epl': { sport: 'soccer', league: 'eng.1' },
};

// Books whose prices we compare (must match the-odds-api bookmaker titles;
// Kalshi merges in separately). Keeps the card consistent with the site grid.
const MAJOR_BOOKS = new Set([
  'DraftKings', 'FanDuel', 'BetMGM', 'BetRivers', 'Caesars', 'BetOnline.ag',
]);

interface FutureEntry {
  name: string;
  odds: number;   // best available American odds
  book?: string;  // which book offers it
  logo?: string;
  color?: string;
}

function matchScore(name1: string, name2: string): number {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  if (n1 === n2) return 4;
  if (n1.includes(n2) || n2.includes(n1)) return 3;
  if (n1.split(' ')[0] === n2.split(' ')[0]) return 2;
  if (n1.split(' ').slice(-1)[0] === n2.split(' ').slice(-1)[0]) return 1;
  return 0;
}

const toProb = (american: number) =>
  american < 0 ? -american / (-american + 100) : 100 / (american + 100);

async function getTopFutures(sport: string): Promise<FutureEntry[]> {
  const entries: FutureEntry[] = [];

  // Sportsbook outrights (when the-odds-api has them)
  const championshipKey = SPORT_TO_CHAMPIONSHIP[sport];
  if (championshipKey && process.env.ODDS_API_KEY) {
    try {
      const resp = await fetch(
        `https://api.the-odds-api.com/v4/sports/${championshipKey}/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=us&markets=outrights&oddsFormat=american`,
        { next: { revalidate: 1800 } }
      );
      if (resp.ok) {
        const events = await resp.json();
        const best: Record<string, { odds: number; book: string }> = {};
        for (const ev of events ?? []) {
          for (const b of ev.bookmakers ?? []) {
            if (!MAJOR_BOOKS.has(b.title)) continue;
            for (const mk of b.markets ?? []) {
              if (mk.key !== 'outrights') continue;
              for (const o of mk.outcomes ?? []) {
                if (typeof o.price !== 'number') continue;
                if (best[o.name] === undefined || o.price > best[o.name].odds) {
                  best[o.name] = { odds: o.price, book: b.title };
                }
              }
            }
          }
        }
        for (const [name, v] of Object.entries(best)) entries.push({ name, odds: v.odds, book: v.book });
      }
    } catch { /* sportsbook side optional */ }
  }

  // Kalshi championship prices (fee-inclusive) — merge, or stand alone (MLS/WNBA)
  try {
    const kalshi = await fetchKalshiFutures(sport);
    const kalshiOnly = entries.length === 0;
    for (const k of kalshi) {
      const existing = entries.find(e => matchScore(e.name, k.team) >= 3);
      if (existing) {
        if (k.odds > existing.odds) {
          existing.odds = k.odds;
          existing.book = 'Kalshi';
        }
      } else if (kalshiOnly) {
        entries.push({ name: k.team, odds: k.odds, book: 'Kalshi' });
      }
    }
  } catch { /* kalshi side optional */ }

  entries.sort((a, b) => toProb(b.odds) - toProb(a.odds));
  return entries;
}

async function attachEspnAssets(sport: string, entries: FutureEntry[]): Promise<void> {
  const espnLeague = ESPN_LEAGUE_MAP[sport];
  if (!espnLeague) return;
  try {
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/teams?limit=1000`,
      { next: { revalidate: 86400 } }
    );
    if (!resp.ok) return;
    const data = await resp.json();
    const teams = (data.sports?.[0]?.leagues?.[0]?.teams ?? []) as Array<{
      team?: { displayName?: string; color?: string; logos?: Array<{ href?: string }> };
    }>;
    for (const e of entries) {
      let bestScore = 0;
      for (const t of teams) {
        const name = t.team?.displayName || '';
        const score = matchScore(name, e.name);
        if (score > bestScore) {
          bestScore = score;
          e.logo = t.team?.logos?.[0]?.href;
          e.color = t.team?.color;
        }
      }
    }
  } catch { /* logos optional */ }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sport: string }>;
}): Promise<Metadata> {
  const { sport } = await params;
  const title = MARKET_TITLES[sport];
  if (!title) {
    return { title: 'Futures | odds.day', description: 'Championship futures odds comparison.' };
  }

  const all = await getTopFutures(sport);
  const top = all.slice(0, 5);
  await attachEspnAssets(sport, top);

  const fmt = (o: number) => (o > 0 ? `+${o}` : `${o}`);
  const description = top.length > 0
    ? `${title} favorites: ${top.slice(0, 3).map(t => `${t.name} ${fmt(t.odds)}`).join(' • ')}`
    : `${title} odds comparison on odds.day`;

  const ogParams = new URLSearchParams({ title });
  if (top.length > 0) {
    ogParams.set('teams', JSON.stringify(top.map(t => ({
      n: t.name, o: fmt(t.odds), l: t.logo ?? '', c: t.color ?? '', b: t.book ?? '',
    }))));
  }
  const ogImageUrl = `https://odds.day/api/og-futures?${ogParams.toString()}`;

  return {
    title: `${title} Odds | odds.day`,
    description,
    openGraph: {
      title: `${title} Odds`,
      description,
      type: 'website',
      siteName: 'odds.day',
      url: `https://odds.day/futures/${sport}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} Odds`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function FuturesSharePage({
  params,
}: {
  params: Promise<{ sport: string }>;
}) {
  const { sport } = await params;
  if (!MARKET_TITLES[sport]) {
    redirect('/');
  }

  const redirectUrl = `/?view=futures&league=${sport}`;

  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        <script dangerouslySetInnerHTML={{
          __html: `window.location.href = "${redirectUrl}";`
        }} />
      </head>
      <body style={{
        backgroundColor: '#ffffff',
        color: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        margin: 0,
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: '10px' }}>{MARKET_TITLES[sport]}</h1>
          <p>Loading futures...</p>
        </div>
      </body>
    </html>
  );
}
