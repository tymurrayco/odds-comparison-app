// src/app/game/[id]/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

// All supported leagues - used for validation and fallback
const ALL_LEAGUES = [
  'basketball_nba',
  'americanfootball_nfl',
  'icehockey_nhl',
  'baseball_mlb',
  'americanfootball_ncaaf',
  'basketball_ncaab',
  'basketball_wnba',
  'soccer_usa_mls',
  'soccer_epl'
];

// Fetch game data server-side for meta tags
// UPDATED: Now accepts optional league parameter to avoid checking all leagues (saves up to 8 API calls!)
async function getGame(id: string, league?: string | null) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) return null;

    // One paid odds call for a known league (3 credits: 3 markets x 1 region)
    const fetchLeagueOdds = async (leagueKey: string) => {
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${leagueKey}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
        { next: { revalidate: 60 } } // Cache for 60 seconds
      );
      if (!response.ok) return null;
      const games = await response.json();
      const game = games.find((g: { id: string }) => g.id === id);
      return game ? { ...game, sport_key: leagueKey } : null;
    };

    // If league is provided and valid, check that league first (1 API call instead of up to 9!)
    if (league && ALL_LEAGUES.includes(league)) {
      const game = await fetchLeagueOdds(league);
      if (game) return game;
      // If not found in specified league, fall through to the resolver
      // This handles edge cases where league param might be stale/wrong
    }

    // Sport-less link (pre-league-param shares) or stale league: resolve which
    // league owns this game id via the FREE events endpoint (verified
    // x-requests-last: 0), then pay for exactly one odds call. The old
    // fallback paid for odds in every league — 27 credits per miss — and
    // Discord/iMessage link previews hit this path on each unfurl.
    const remaining = ALL_LEAGUES.filter((l) => l !== league);
    const matches = await Promise.all(
      remaining.map(async (leagueKey) => {
        try {
          const res = await fetch(
            `https://api.the-odds-api.com/v4/sports/${leagueKey}/events?apiKey=${apiKey}`,
            { next: { revalidate: 60 } }
          );
          if (!res.ok) return null;
          const events = await res.json();
          return events.some((e: { id: string }) => e.id === id) ? leagueKey : null;
        } catch {
          return null;
        }
      })
    );
    const found = matches.find((l) => l !== null);
    return found ? await fetchLeagueOdds(found) : null;
  } catch (error) {
    console.error('Error fetching game:', error);
    return null;
  }
}

// Helper to get spread, total, and implied scores from game data
function getGameLines(game: {
  bookmakers?: Array<{
    markets?: Array<{
      key: string;
      outcomes?: Array<{
        name: string;
        point?: number;
        price?: number;
      }>;
    }>;
  }>;
  home_team?: string;
  away_team?: string;
}) {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return { spread: null, total: null, impliedAway: null, impliedHome: null, awayML: null, homeML: null };
  }

  // Consensus lines: average spread/total across ALL books — the same inputs
  // (and rounding) as the site's GameCard.calculateImpliedScores, so the share
  // card always agrees with the page it links to. Spread/total display rounds
  // to 0.1, matching the site's spread-average convention.
  const awaySpreads: number[] = [];
  const totals: number[] = [];
  const awayProbs: number[] = [];
  const homeProbs: number[] = [];
  const toProb = (american: number) =>
    american < 0 ? -american / (-american + 100) : 100 / (american + 100);
  for (const b of game.bookmakers) {
    const sm = b.markets?.find((m: { key: string }) => m.key === 'spreads');
    const away = sm?.outcomes?.find((o: { name: string }) => o.name === game.away_team);
    if (away && away.point !== undefined) awaySpreads.push(away.point);
    const tm = b.markets?.find((m: { key: string }) => m.key === 'totals');
    const over = tm?.outcomes?.find((o: { name: string }) => o.name === 'Over');
    if (over && over.point !== undefined) totals.push(over.point);
    const hm = b.markets?.find((m: { key: string }) => m.key === 'h2h');
    const awayH2h = hm?.outcomes?.find((o: { name: string; price?: number }) => o.name === game.away_team);
    const homeH2h = hm?.outcomes?.find((o: { name: string; price?: number }) => o.name === game.home_team);
    if (awayH2h?.price !== undefined) awayProbs.push(toProb(awayH2h.price));
    if (homeH2h?.price !== undefined) homeProbs.push(toProb(homeH2h.price));
  }

  // Consensus moneylines: average implied probability, back to American, nearest 5
  const toAmerican = (p: number) =>
    p >= 0.5 ? -Math.round((p / (1 - p)) * 100 / 5) * 5 : Math.round(((1 - p) / p) * 100 / 5) * 5;
  const awayML = awayProbs.length > 0
    ? toAmerican(awayProbs.reduce((a, v) => a + v, 0) / awayProbs.length)
    : null;
  const homeML = homeProbs.length > 0
    ? toAmerican(homeProbs.reduce((a, v) => a + v, 0) / homeProbs.length)
    : null;

  let spread: number | null = null;       // consensus HOME spread
  let total: number | null = null;        // consensus total
  let impliedAway: number | null = null;
  let impliedHome: number | null = null;

  // Display snaps to the nearest 0.5 so the card reads like a bettable line;
  // implied scores below still use the exact averages.
  if (awaySpreads.length > 0) {
    const avgAwaySpread = awaySpreads.reduce((s, v) => s + v, 0) / awaySpreads.length;
    spread = Math.round(-avgAwaySpread * 2) / 2;
  }
  if (totals.length > 0) {
    const avgTotal = totals.reduce((s, v) => s + v, 0) / totals.length;
    total = Math.round(avgTotal * 2) / 2;
  }
  if (awaySpreads.length > 0 && totals.length > 0) {
    const avgSpread = awaySpreads.reduce((s, v) => s + v, 0) / awaySpreads.length;
    const avgTotal = totals.reduce((s, v) => s + v, 0) / totals.length;
    impliedAway = Math.round((avgTotal - avgSpread) / 2);
    impliedHome = Math.round((avgTotal + avgSpread) / 2);
  }

  return {
    spread,
    total,
    impliedAway,
    impliedHome,
    awayML,
    homeML
  };
}

// Helper to get league display name
function getLeagueName(sportKey: string): string {
  const leagueMap: { [key: string]: string } = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'americanfootball_ncaaf': 'NCAAF',
    'basketball_ncaab': 'NCAAB',
    'icehockey_nhl': 'NHL',
    'baseball_mlb': 'MLB',
    'soccer_usa_mls': 'MLS',
    'soccer_epl': 'EPL',
    'basketball_wnba': 'WNBA'
  };
  return leagueMap[sportKey] || sportKey.toUpperCase();
}

// ESPN league mapping for fetching logos
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

// Two-word mascots that a naive last-word split would chop ("Tar Heels" → "Heels").
// Checked as the final two words of the team name; anything else uses the last word.
const TWO_WORD_MASCOTS = new Set([
  'tar heels', 'yellow jackets', 'horned frogs', 'blue devils', 'blue jays',
  'blue jackets', 'blue raiders', 'blue hens', 'white sox', 'red sox',
  'red wings', 'red raiders', 'red storm', 'red bulls', 'red wolves',
  'golden bears', 'golden knights', 'golden eagles', 'golden gophers',
  'golden flashes', 'golden hurricane', 'golden panthers', 'golden griffins',
  'maple leafs', 'trail blazers', 'sun devils', 'crimson tide',
  'fighting irish', 'fighting illini', 'fighting hawks', 'demon deacons',
  'scarlet knights', 'nittany lions', 'mean green', 'green wave',
  'ragin cajuns', 'black knights', 'black bears', 'purple aces',
  'purple eagles', 'blue bombers', 'tiger-cats', 'roughriders',
  'wolf pack', 'green wave', 'red flash', 'blue hose', 'golden lions',
  'river hawks', 'sea wolves', 'great danes', 'blue raiders',
]);

function getMascot(teamName: string): string {
  const words = teamName.trim().split(/\s+/);
  if (words.length >= 2) {
    const lastTwo = words.slice(-2).join(' ').toLowerCase().replace(/['.]/g, '');
    if (TWO_WORD_MASCOTS.has(lastTwo)) return words.slice(-2).join(' ');
  }
  return words[words.length - 1];
}

// Match strength between an ESPN team name and the odds-api team name.
// Weak criteria (shared mascot/first word) must never beat a stronger match
// elsewhere in the list — "California Golden Bears" was picking up the Baylor
// Bears logo because a first-weak-match-wins loop hit Baylor alphabetically.
function matchScore(name1: string, name2: string): number {
  // Accent-fold (San José -> san jose): without it the strong equality tier
  // can't fire against the unaccented odds-api name, and every "San ..."
  // school ties at the weak first-word tier — first-alphabetical (San Diego
  // State) then wins the logo.
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const n1 = fold(name1);
  const n2 = fold(name2);
  if (n1 === n2) return 4;
  if (n1.includes(n2) || n2.includes(n1)) return 3;
  if (n1.split(' ')[0] === n2.split(' ')[0]) return 2;
  if (n1.split(' ').slice(-1)[0] === n2.split(' ').slice(-1)[0]) return 1;
  return 0;
}

// Fetch ESPN logos + primary colors using the teams endpoint (works for any game, not just today's)
async function getESPNLogos(
  sportKey: string,
  awayTeam: string,
  homeTeam: string
): Promise<{ awayLogo: string | null; homeLogo: string | null; awayColor: string | null; homeColor: string | null; awayAlt: string | null; homeAlt: string | null; awayMascot: string | null; homeMascot: string | null }> {
  const empty = { awayLogo: null, homeLogo: null, awayColor: null, homeColor: null, awayAlt: null, homeAlt: null, awayMascot: null, homeMascot: null };
  try {
    const espnLeague = ESPN_LEAGUE_MAP[sportKey];
    if (!espnLeague) return empty;
    
    // Use teams endpoint to get all team logos. limit=1000: ESPN ignores group
    // filters and college football has 755 teams — lower limits truncate the
    // list and silently drop teams (TCU was missing at limit=200).
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/teams?limit=1000`;
    
    const response = await fetch(apiUrl, { next: { revalidate: 86400 } }); // Cache for 24 hours
    if (!response.ok) return empty;
    
    const data = await response.json();
    
    let awayLogo: string | null = null;
    let homeLogo: string | null = null;
    let awayColor: string | null = null;
    let homeColor: string | null = null;
    let awayAlt: string | null = null;
    let homeAlt: string | null = null;
    let awayMascot: string | null = null;
    let homeMascot: string | null = null;
    let awayBest = 0;
    let homeBest = 0;

    interface ESPNTeamInfo {
      displayName?: string;
      name?: string;          // mascot only, e.g. "Wolf Pack"
      color?: string;
      alternateColor?: string;
      logos?: Array<{ href?: string }>;
    }

    interface ESPNTeamEntry {
      team?: ESPNTeamInfo;
    }

    if (data.sports?.[0]?.leagues?.[0]?.teams) {
      // Scan the full list keeping the BEST match per side — never first-match.
      for (const entry of data.sports[0].leagues[0].teams as ESPNTeamEntry[]) {
        const team = entry.team;
        if (!team) continue;

        const teamName = team.displayName || team.name || '';
        const logo = team.logos?.[0]?.href;
        if (!logo) continue;

        const awayScore = matchScore(teamName, awayTeam);
        if (awayScore > awayBest) {
          awayBest = awayScore;
          awayLogo = logo;
          awayColor = team.color || null;
          awayAlt = team.alternateColor || null;
          awayMascot = team.name || null;
        }
        const homeScore = matchScore(teamName, homeTeam);
        if (homeScore > homeBest) {
          homeBest = homeScore;
          homeLogo = logo;
          homeColor = team.color || null;
          homeAlt = team.alternateColor || null;
          homeMascot = team.name || null;
        }
        if (awayBest === 4 && homeBest === 4) break;
      }
    }

    return { awayLogo, homeLogo, awayColor, homeColor, awayAlt, homeAlt, awayMascot, homeMascot };
  } catch (error) {
    console.error('Error fetching ESPN logos:', error);
    return empty;
  }
}

// Look up the TV broadcast for a game from ESPN's scoreboard (cached 1h).
// Prefers a national network over regional/streaming feed lists.
const NATIONAL_NETWORKS = [
  'ABC', 'CBS', 'NBC', 'FOX', 'ESPN', 'ESPN2', 'ESPNU', 'FS1', 'FS2', 'TNT',
  'TBS', 'CBSSN', 'NFL Network', 'NFL NET', 'MLB Network', 'NBA TV', 'Prime Video',
  'Peacock', 'Apple TV+', 'Netflix', 'The CW', 'ION', 'BTN', 'SEC Network',
  'SECN', 'ACC Network', 'ACCN', 'truTV', 'ESPN+',
];

async function getTVBroadcast(
  sportKey: string,
  awayTeam: string,
  homeTeam: string,
  commenceTime: string
): Promise<string | null> {
  try {
    const espnLeague = ESPN_LEAGUE_MAP[sportKey];
    if (!espnLeague) return null;

    // Scoreboard dates are US Eastern calendar days
    const d = new Date(commenceTime);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d).replace(/-/g, '');
    const isCollege = espnLeague.league === 'college-football' || espnLeague.league === 'mens-college-basketball';
    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/scoreboard?dates=${parts}${isCollege ? '&limit=300&groups=80' : ''}`;

    const resp = await fetch(url, { next: { revalidate: 3600 } });
    if (!resp.ok) return null;
    const data = await resp.json();

    interface Competitor { team?: { displayName?: string } }
    interface Broadcast { names?: string[] }
    interface GeoBroadcast { media?: { shortName?: string } }
    interface Competition { competitors?: Competitor[]; broadcasts?: Broadcast[]; geoBroadcasts?: GeoBroadcast[] }
    interface ESPNEvent { competitions?: Competition[] }

    let best: Competition | null = null;
    let bestScore = 0;
    for (const e of (data.events ?? []) as ESPNEvent[]) {
      const comp = e.competitions?.[0];
      const names = (comp?.competitors ?? []).map(c => c.team?.displayName || '');
      if (names.length < 2) continue;
      const score = Math.max(
        matchScore(names[0], homeTeam) + matchScore(names[1], awayTeam),
        matchScore(names[0], awayTeam) + matchScore(names[1], homeTeam),
      );
      if (score > bestScore) { bestScore = score; best = comp ?? null; }
    }
    if (!best || bestScore < 4) return null;

    const candidates = [
      ...(best.broadcasts ?? []).flatMap(b => b.names ?? []),
      ...(best.geoBroadcasts ?? []).map(g => g.media?.shortName).filter((n): n is string => !!n),
    ];
    if (candidates.length === 0) return null;
    const national = candidates.find(c =>
      NATIONAL_NETWORKS.some(n => c.toLowerCase() === n.toLowerCase())
    );
    return national ?? candidates[0];
  } catch {
    return null;
  }
}

// Generate dynamic metadata for Open Graph
// UPDATED: Now reads league from searchParams to optimize API usage
export async function generateMetadata({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string; tz?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { league, tz } = await searchParams;
  const game = await getGame(id, league);
  
  if (!game) {
    return {
      title: 'Game Not Found | odds.day',
      description: 'This game could not be found.',
    };
  }
  
  const { spread, total, impliedAway, impliedHome, awayML, homeML } = getGameLines(game);
  const leagueName = getLeagueName(game.sport_key);
  
  // Format game time in the SHARER's timezone (embedded in the link by the
  // copy button as ?tz=). Falls back to the site's home timezone (Arizona)
  // for links without one. The card is a static image — it shows the sharer's
  // zone to every recipient, labeled with the zone abbreviation.
  const isValidTz = (z: string): boolean => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: z });
      return true;
    } catch {
      return false;
    }
  };
  const CARD_TIMEZONE = tz && isValidTz(tz) ? tz : 'America/Phoenix';
  const gameDate = new Date(game.commence_time);
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: CARD_TIMEZONE
  });
  const tzAbbr = new Intl.DateTimeFormat('en-US', { timeZone: CARD_TIMEZONE, timeZoneName: 'short' })
    .formatToParts(gameDate)
    .find(part => part.type === 'timeZoneName')?.value ?? '';

  // Build description with odds info
  let description = `${leagueName} • ${formattedDate} ${tzAbbr}`;
  if (spread !== null && spread !== undefined) {
    const spreadStr = spread > 0 ? `+${spread}` : `${spread}`;
    description += ` • ${game.home_team} ${spreadStr}`;
  }
  if (total !== null && total !== undefined) {
    description += ` • O/U ${total}`;
  }
  
  // Add ESPN logos + TV broadcast if we can fetch them
  const [espnLogos, tvNetwork] = await Promise.all([
    getESPNLogos(game.sport_key, game.away_team, game.home_team),
    getTVBroadcast(game.sport_key, game.away_team, game.home_team, game.commence_time),
  ]);
  if (tvNetwork) {
    description += ` • ${tvNetwork}`;
  }

  // Mascot for titles/labels: ESPN publishes it as its own field (team.name),
  // so "Nevada Wolf Pack" -> "Wolf Pack" without guessing where the school
  // name ends. getMascot() is the fallback for teams ESPN doesn't match.
  const awayMascot = espnLogos.awayMascot || getMascot(game.away_team);
  const homeMascot = espnLogos.homeMascot || getMascot(game.home_team);
  const title = `${awayMascot} @ ${homeMascot}`;
  
  // Build OG image URL with game info
  const ogImageParams = new URLSearchParams({
    away: game.away_team,
    home: game.home_team,
    league: leagueName,
    time: `${formattedDate} ${tzAbbr}`,
  });
  
  if (spread !== null && spread !== undefined) {
    const spreadStr = spread > 0 ? `+${spread}` : `${spread}`;
    ogImageParams.set('spread', `${homeMascot} ${spreadStr}`);
  }
  if (total !== null && total !== undefined) {
    ogImageParams.set('total', `${total}`);
  }
  
  // Add implied scores
  if (impliedAway !== null && impliedHome !== null) {
    ogImageParams.set('impliedAway', `${impliedAway}`);
    ogImageParams.set('impliedHome', `${impliedHome}`);
    ogImageParams.set('awayName', awayMascot);
    ogImageParams.set('homeName', homeMascot);
  }
  
  if (espnLogos.awayLogo) {
    ogImageParams.set('awayLogo', espnLogos.awayLogo);
  }
  if (espnLogos.homeLogo) {
    ogImageParams.set('homeLogo', espnLogos.homeLogo);
  }
  if (espnLogos.awayColor) {
    ogImageParams.set('awayColor', espnLogos.awayColor);
  }
  if (espnLogos.homeColor) {
    ogImageParams.set('homeColor', espnLogos.homeColor);
  }
  if (espnLogos.awayAlt) {
    ogImageParams.set('awayAlt', espnLogos.awayAlt);
  }
  if (espnLogos.homeAlt) {
    ogImageParams.set('homeAlt', espnLogos.homeAlt);
  }
  if (awayML !== null) {
    ogImageParams.set('awayML', awayML > 0 ? `+${awayML}` : `${awayML}`);
  }
  if (homeML !== null) {
    ogImageParams.set('homeML', homeML > 0 ? `+${homeML}` : `${homeML}`);
  }
  if (tvNetwork) {
    ogImageParams.set('tv', tvNetwork);
  }
  
  const ogImageUrl = `https://www.odds.day/api/og?${ogImageParams.toString()}`;
  
  return {
    title: `${title} | odds.day`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'odds.day',
      // Canonical URL must carry the league — platforms and crawlers follow
      // og:url, and a sport-less address sends every unfurl through the
      // 9-league resolver instead of a single direct lookup.
      url: `https://www.odds.day/game/${id}?league=${game.sport_key}`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

// The page component renders content then redirects client-side
// This allows crawlers to read meta tags before redirect
// UPDATED: Now reads league from searchParams to optimize API usage
export default async function GamePage({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}) {
  const { id } = await params;
  const { league } = await searchParams;
  const game = await getGame(id, league);
  
  if (!game) {
    redirect('/');
  }
  
  const redirectUrl = `/?game=${id}&league=${game.sport_key}`;
  
  // Render a page that does client-side redirect
  // This ensures meta tags are served to crawlers
  return (
    <html>
      <head>
        <meta httpEquiv="refresh" content={`0;url=${redirectUrl}`} />
        <script dangerouslySetInnerHTML={{
          __html: `window.location.href = "${redirectUrl}";`
        }} />
      </head>
      <body style={{ 
        backgroundColor: '#1e3a5f', 
        color: 'white', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100vh',
        margin: 0,
        fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ marginBottom: '10px' }}>{game.away_team} @ {game.home_team}</h1>
          <p>Loading game...</p>
        </div>
      </body>
    </html>
  );
}
