// src/app/game/[id]/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';

// Fetch game data server-side for meta tags
async function getGame(id: string) {
  try {
    // Try each league until we find the game
    const leagues = [
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
    
    for (const league of leagues) {
      const apiKey = process.env.ODDS_API_KEY;
      if (!apiKey) continue;
      
      const response = await fetch(
        `https://api.the-odds-api.com/v4/sports/${league}/odds/?apiKey=${apiKey}&regions=us&markets=spreads,totals,h2h&oddsFormat=american`,
        { next: { revalidate: 60 } } // Cache for 60 seconds
      );
      
      if (!response.ok) continue;
      
      const games = await response.json();
      const game = games.find((g: { id: string }) => g.id === id);
      
      if (game) {
        return { ...game, sport_key: league };
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
  
  const bookmaker = game.bookmakers[0];
  const spreadsMarket = bookmaker.markets?.find((m: { key: string }) => m.key === 'spreads');
  const totalsMarket = bookmaker.markets?.find((m: { key: string }) => m.key === 'totals');
  
  const homeSpread = spreadsMarket?.outcomes?.find((o: { name: string }) => o.name === game.home_team);
  const totalOver = totalsMarket?.outcomes?.find((o: { name: string }) => o.name === 'Over');
  
  const spread = homeSpread?.point ?? null;
  const total = totalOver?.point ?? null;
  
  // Calculate implied scores
  let impliedAway: number | null = null;
  let impliedHome: number | null = null;
  
  if (spread !== null && total !== null) {
    // Home spread is negative means home is favored
    // Implied home = (total - spread) / 2
    // Implied away = (total + spread) / 2
    impliedHome = Math.round(((total - spread) / 2) * 10) / 10;
    impliedAway = Math.round(((total + spread) / 2) * 10) / 10;
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

// Helper to match team names
function teamsMatch(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase();
  const n2 = name2.toLowerCase();
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  // Check last word (mascot)
  const mascot1 = n1.split(' ').slice(-1)[0];
  const mascot2 = n2.split(' ').slice(-1)[0];
  if (mascot1 === mascot2) return true;
  // Check first word
  const first1 = n1.split(' ')[0];
  const first2 = n2.split(' ')[0];
  if (first1 === first2) return true;
  return false;
}

// Fetch ESPN logos for teams using the teams endpoint (works for any game, not just today's)
async function getESPNLogos(
  sportKey: string, 
  awayTeam: string, 
  homeTeam: string
): Promise<{ awayLogo: string | null; homeLogo: string | null }> {
  try {
    const espnLeague = ESPN_LEAGUE_MAP[sportKey];
    if (!espnLeague) return { awayLogo: null, homeLogo: null };
    
    // Use teams endpoint to get all team logos
    const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sport}/${espnLeague.league}/teams?limit=200`;
    
    const response = await fetch(apiUrl, { next: { revalidate: 86400 } }); // Cache for 24 hours
    if (!response.ok) return { awayLogo: null, homeLogo: null };
    
    const data = await response.json();
    
    let awayLogo: string | null = null;
    let homeLogo: string | null = null;
    
    interface ESPNTeamInfo {
      displayName?: string;
      name?: string;
      logos?: Array<{ href?: string }>;
    }
    
    interface ESPNTeamEntry {
      team?: ESPNTeamInfo;
    }
    
    if (data.sports?.[0]?.leagues?.[0]?.teams) {
      for (const entry of data.sports[0].leagues[0].teams as ESPNTeamEntry[]) {
        const team = entry.team;
        if (!team) continue;
        
        const teamName = team.displayName || team.name || '';
        const logo = team.logos?.[0]?.href;
        
        if (logo) {
          if (teamsMatch(teamName, awayTeam) && !awayLogo) {
            awayLogo = logo;
          }
          if (teamsMatch(teamName, homeTeam) && !homeLogo) {
            homeLogo = logo;
          }
        }
        
        if (awayLogo && homeLogo) break;
      }
    }
    
    return { awayLogo, homeLogo };
  } catch (error) {
    console.error('Error fetching ESPN logos:', error);
    return { awayLogo: null, homeLogo: null };
  }
}

// Generate dynamic metadata for Open Graph
export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}): Promise<Metadata> {
  const { id } = await params;
  const game = await getGame(id);
  
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
export default async function GamePage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const game = await getGame(id);
  
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