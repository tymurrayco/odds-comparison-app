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

    // If league is provided and valid, check that league first (1 API call instead of up to 9!)
    if (league && ALL_LEAGUES.includes(league)) {
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
        { next: { revalidate: 60 } } // Cache for 60 seconds
      );
      
      if (response.ok) {
        const games = await response.json();
        const game = games.find((g: { id: string }) => g.id === id);
        
        if (game) {
          return { ...game, sport_key: league };
        }
      }
      // If not found in specified league, fall through to check all leagues
      // This handles edge cases where league param might be stale/wrong
    }
    
    // Fallback: Try each league until we find the game (for old links without league param)
    for (const leagueKey of ALL_LEAGUES) {
      // Skip the league we already checked above
      if (leagueKey === league) continue;
      
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${leagueKey}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
        { next: { revalidate: 60 } } // Cache for 60 seconds
      );
      
      if (!response.ok) continue;
      
      const games = await response.json();
      const game = games.find((g: { id: string }) => g.id === id);
      
      if (game) {
        return { ...game, sport_key: leagueKey };
      }
    }
    
    return null;
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
      }>;
    }>;
  }>;
  home_team?: string;
  away_team?: string;
}) {
  if (!game.bookmakers || game.bookmakers.length === 0) {
    return { spread: null, total: null, impliedAway: null, impliedHome: null };
  }

  // Consensus lines: average spread/total across ALL books — the same inputs
  // (and rounding) as the site's GameCard.calculateImpliedScores, so the share
  // card always agrees with the page it links to. Spread/total display rounds
  // to 0.1, matching the site's spread-average convention.
  const awaySpreads: number[] = [];
  const totals: number[] = [];
  for (const b of game.bookmakers) {
    const sm = b.markets?.find((m: { key: string }) => m.key === 'spreads');
    const away = sm?.outcomes?.find((o: { name: string }) => o.name === game.away_team);
    if (away && away.point !== undefined) awaySpreads.push(away.point);
    const tm = b.markets?.find((m: { key: string }) => m.key === 'totals');
    const over = tm?.outcomes?.find((o: { name: string }) => o.name === 'Over');
    if (over && over.point !== undefined) totals.push(over.point);
  }

  let spread: number | null = null;       // consensus HOME spread
  let total: number | null = null;        // consensus total
  let impliedAway: number | null = null;
  let impliedHome: number | null = null;

  if (awaySpreads.length > 0) {
    const avgAwaySpread = awaySpreads.reduce((s, v) => s + v, 0) / awaySpreads.length;
    spread = Math.round(-avgAwaySpread * 10) / 10;
  }
  if (totals.length > 0) {
    const avgTotal = totals.reduce((s, v) => s + v, 0) / totals.length;
    total = Math.round(avgTotal * 10) / 10;
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
    impliedHome
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

// Match strength between an ESPN team name and the odds-api team name.
// Weak criteria (shared mascot/first word) must never beat a stronger match
// elsewhere in the list — "California Golden Bears" was picking up the Baylor
// Bears logo because a first-weak-match-wins loop hit Baylor alphabetically.
function matchScore(name1: string, name2: string): number {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
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
): Promise<{ awayLogo: string | null; homeLogo: string | null; awayColor: string | null; homeColor: string | null }> {
  const empty = { awayLogo: null, homeLogo: null, awayColor: null, homeColor: null };
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
    let awayBest = 0;
    let homeBest = 0;

    interface ESPNTeamInfo {
      displayName?: string;
      name?: string;
      color?: string;
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
        }
        const homeScore = matchScore(teamName, homeTeam);
        if (homeScore > homeBest) {
          homeBest = homeScore;
          homeLogo = logo;
          homeColor = team.color || null;
        }
        if (awayBest === 4 && homeBest === 4) break;
      }
    }

    return { awayLogo, homeLogo, awayColor, homeColor };
  } catch (error) {
    console.error('Error fetching ESPN logos:', error);
    return empty;
  }
}

// Generate dynamic metadata for Open Graph
// UPDATED: Now reads league from searchParams to optimize API usage
export async function generateMetadata({ 
  params,
  searchParams
}: { 
  params: Promise<{ id: string }>;
  searchParams: Promise<{ league?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { league } = await searchParams;
  const game = await getGame(id, league);
  
  if (!game) {
    return {
      title: 'Game Not Found | odds.day',
      description: 'This game could not be found.',
    };
  }
  
  const { spread, total, impliedAway, impliedHome } = getGameLines(game);
  const leagueName = getLeagueName(game.sport_key);
  
  // Format game time in Eastern timezone (most US sports)
  const gameDate = new Date(game.commence_time);
  const formattedDate = gameDate.toLocaleDateString('en-US', { 
    weekday: 'short',
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });
  
  // Build description with odds info
  let description = `${leagueName} • ${formattedDate} ET`;
  if (spread !== null && spread !== undefined) {
    const spreadStr = spread > 0 ? `+${spread}` : `${spread}`;
    description += ` • ${game.home_team} ${spreadStr}`;
  }
  if (total !== null && total !== undefined) {
    description += ` • O/U ${total}`;
  }
  
  // Use mascot names (last word) for title
  const awayMascot = game.away_team.split(' ').slice(-1)[0];
  const homeMascot = game.home_team.split(' ').slice(-1)[0];
  const title = `${awayMascot} @ ${homeMascot}`;
  
  // Build OG image URL with game info
  const ogImageParams = new URLSearchParams({
    away: game.away_team,
    home: game.home_team,
    league: leagueName,
    time: formattedDate + ' ET',
  });
  
  if (spread !== null && spread !== undefined) {
    const spreadStr = spread > 0 ? `+${spread}` : `${spread}`;
    ogImageParams.set('spread', `${game.home_team.split(' ').slice(-1)[0]} ${spreadStr}`);
  }
  if (total !== null && total !== undefined) {
    ogImageParams.set('total', `${total}`);
  }
  
  // Add implied scores
  if (impliedAway !== null && impliedHome !== null) {
    ogImageParams.set('impliedAway', `${impliedAway}`);
    ogImageParams.set('impliedHome', `${impliedHome}`);
    ogImageParams.set('awayName', game.away_team.split(' ').slice(-1)[0]);
    ogImageParams.set('homeName', game.home_team.split(' ').slice(-1)[0]);
  }
  
  // Add ESPN logos if we can fetch them
  const espnLogos = await getESPNLogos(game.sport_key, game.away_team, game.home_team);
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
  
  const ogImageUrl = `https://odds.day/api/og?${ogImageParams.toString()}`;
  
  return {
    title: `${title} | odds.day`,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'odds.day',
      url: `https://odds.day/game/${id}`,
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
