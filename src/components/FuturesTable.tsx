// src/components/FuturesTable.tsx
'use client';

import { FuturesMarket, BOOKMAKERS } from '@/lib/api';
import { createBet } from '@/lib/betService';
import React, { useState, useRef, useEffect } from 'react';

interface FuturesTableProps {
  market: FuturesMarket;
  compactMode?: boolean;
  isMasters?: boolean;
  selectedBookmakers?: string[];
  league?: string; // The active league for creating bets
}

// Helper function to calculate stake for 1 unit to-win
function calculateStakeForOneUnit(odds: number): number {
  if (odds > 0) {
    // Underdog: stake = 100 / odds to win 1 unit
    return 100 / odds;
  } else {
    // Favorite: stake = |odds| / 100 to win 1 unit
    return Math.abs(odds) / 100;
  }
}

// Helper function to map league ID to sport name
function getSportFromLeague(league: string): string {
  if (league.includes('nba') || league.includes('basketball')) return 'Basketball';
  if (league.includes('nfl') || league.includes('americanfootball_nfl')) return 'Football';
  if (league.includes('ncaaf') || league.includes('americanfootball_ncaaf')) return 'Football';
  if (league.includes('ncaab')) return 'Basketball';
  if (league.includes('nhl') || league.includes('icehockey')) return 'Hockey';
  if (league.includes('mlb') || league.includes('baseball')) return 'Baseball';
  if (league.includes('mls') || league.includes('soccer')) return 'Soccer';
  if (league.includes('epl')) return 'Soccer';
  if (league.includes('wnba')) return 'Basketball';
  if (league.includes('golf') || league.includes('masters')) return 'Golf';
  return 'Other';
}

// Helper function to get league display name
function getLeagueDisplayName(league: string): string {
  const leagueMap: { [key: string]: string } = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'americanfootball_ncaaf': 'NCAAF',
    'basketball_ncaab': 'NCAAB',
    'icehockey_nhl': 'NHL',
    'baseball_mlb': 'MLB',
    'soccer_usa_mls': 'MLS',
    'soccer_epl': 'EPL',
    'basketball_wnba': 'WNBA',
    'golf_masters_tournament_winner': 'PGA'
  };
  return leagueMap[league] || league.toUpperCase();
}

// Helper function to get a readable market title for the bet description
function getMarketDescription(league: string): string {
  const leagueNames: { [key: string]: string } = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'Super Bowl',
    'americanfootball_ncaaf': 'CFP',
    'basketball_ncaab': 'March Madness',
    'icehockey_nhl': 'Stanley Cup',
    'baseball_mlb': 'World Series',
    'soccer_epl': 'EPL',
    'golf_masters_tournament_winner': 'Masters'
  };
  
  const leagueName = leagueNames[league] || getLeagueDisplayName(league);
  return `${leagueName} Winner`;
}

// Common mascots to strip for matching KenPom names to Odds API names
const MASCOTS = [
  'wildcats', 'bulldogs', 'tigers', 'bears', 'eagles', 'cardinals', 'hokies',
  'hurricanes', 'panthers', 'yellow jackets', 'fighting irish', 'demon deacons',
  'seminoles', 'blue devils', 'cavaliers', 'spartans', 'buckeyes', 'nittany lions',
  'wolverines', 'hoosiers', 'boilermakers', 'fighting illini', 'hawkeyes', 'badgers',
  'golden gophers', 'cornhuskers', 'scarlet knights', 'terrapins', 'bruins', 'trojans',
  'ducks', 'huskies', 'jayhawks', 'cyclones', 'red raiders', 'mountaineers',
  'horned frogs', 'longhorns', 'sooners', 'cougars', 'knights', 'bearcats',
  'sun devils', 'buffaloes', 'utes', 'volunteers', 'crimson tide', 'razorbacks',
  'gators', 'rebels', 'gamecocks', 'aggies', 'commodores', 'musketeers', 'friars',
  'pirates', 'red storm', 'golden eagles', 'blue demons', 'hoyas', 'gaels', 'rams',
  'flyers', 'wolf pack', 'broncos', 'lobos', 'aztecs', 'shockers', 'tar heels',
  'orange', 'wolfpack', 'thundering herd', 'zags', 'orangemen', 'crimson',
  'cardinal', 'owls', 'hawks', 'flames', 'phoenix', 'ramblers', 'billikens',
  'bonnies', 'colonials', 'explorers', 'dukes', 'spiders', 'toreros', 'dons',
  'waves', 'pilots', 'lakers', 'anteaters', 'gauchos', 'matadors', 'tritons',
  'roadrunners', 'miners', 'mean green', 'monarchs', 'keydets', 'boilermakers'
];

/**
 * Normalize team name for matching against KenPom elite list
 */
function normalizeForMatch(name: string): string {
  let normalized = name.toLowerCase().trim();
  
  // Remove mascots
  for (const mascot of MASCOTS) {
    normalized = normalized.replace(new RegExp(`\\s+${mascot}$`, 'i'), '');
  }
  
  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Normalize variations
  normalized = normalized
    .replace(/\bstate\b/gi, 'st')
    .replace(/\bst\.\b/gi, 'st')
    .replace(/\bsaint\b/gi, 'st')
    .replace(/\buniversity\b/gi, '')
    .replace(/\bcollege\b/gi, '')
    .replace(/[.'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

// Interface for elite team data from API
interface EliteTeamData {
  name: string;
  normalized: string;
  rankOE: number;
  rankDE: number;
  rankEM: number;
}

export default function FuturesTable({ 
  market, 
  compactMode = false,
  isMasters = false,
  selectedBookmakers,
  league = 'basketball_nba'
}: FuturesTableProps) {
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [holdingKey, setHoldingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // State for KenPom elite teams (NCAAB only)
  const [eliteTeamsNormalized, setEliteTeamsNormalized] = useState<Set<string>>(new Set());
  const [eliteTeamsDetails, setEliteTeamsDetails] = useState<Map<string, EliteTeamData>>(new Map());
  const [eliteLoading, setEliteLoading] = useState(false);

  // Fetch KenPom elite teams when league is NCAAB
  useEffect(() => {
    if (league !== 'basketball_ncaab') {
      setEliteTeamsNormalized(new Set());
      setEliteTeamsDetails(new Map());
      return;
    }

    const fetchEliteTeams = async () => {
      setEliteLoading(true);
      try {
        const response = await fetch('/api/futures/ncaab-elite');
        const data = await response.json();
        
        if (data.success && data.eliteTeamsNormalized) {
          setEliteTeamsNormalized(new Set(data.eliteTeamsNormalized));
          
          // Build details map for tooltips
          if (data.details) {
            const detailsMap = new Map<string, EliteTeamData>();
            data.details.forEach((team: EliteTeamData) => {
              detailsMap.set(team.normalized, team);
            });
            setEliteTeamsDetails(detailsMap);
          }
          
          console.log(`[FuturesTable] Loaded ${data.count} elite teams for NCAAB`);
        }
      } catch (error) {
        console.error('[FuturesTable] Error fetching elite teams:', error);
      } finally {
        setEliteLoading(false);
      }
    };

    fetchEliteTeams();
  }, [league]);

  /**
   * Check if a team is elite (top 25 in both Ortg and Drtg)
   */
  const isEliteTeam = (teamName: string): boolean => {
    if (league !== 'basketball_ncaab' || eliteTeamsNormalized.size === 0) {
      return false;
    }
    const normalized = normalizeForMatch(teamName);
    return eliteTeamsNormalized.has(normalized);
  };

  /**
   * Get elite team details for tooltip
   */
  const getEliteDetails = (teamName: string): EliteTeamData | undefined => {
    const normalized = normalizeForMatch(teamName);
    return eliteTeamsDetails.get(normalized);
  };

  // Use selected bookmakers or default to all
  const displayBookmakers = selectedBookmakers && selectedBookmakers.length > 0 
    ? BOOKMAKERS.filter(b => selectedBookmakers.includes(b))
    : BOOKMAKERS;

  const formatOdds = (odds: number): string => {
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle press-and-hold to create futures bet
  const handlePressStart = (
    team: string,
    odds: number,
    bookmaker: string,
    cellKey: string
  ) => {
    setHoldingKey(cellKey);
    
    pressTimer.current = setTimeout(async () => {
      // Calculate stake for 1 unit to-win
      const stake = calculateStakeForOneUnit(odds);
      
      // Create bet description (e.g., "NBA Winner" or "Super Bowl Winner")
      const marketDescription = getMarketDescription(league);
      
      // The bet field shows what was bet on (e.g., "Kansas City Chiefs +450")
      const betString = `${team} ${formatOdds(odds)}`;
      
      try {
        // For futures, event date is typically end of season - use a far future date
        // or we can use today's date as the bet placement date
        const today = new Date();
        const eventDateString = `${today.getFullYear()}-12-31`; // End of year as placeholder
        
        await createBet({
          date: today.toISOString().split('T')[0],
          eventDate: eventDateString,
          sport: getSportFromLeague(league),
          league: getLeagueDisplayName(league),
          description: marketDescription,
          awayTeam: undefined,
          homeTeam: undefined,
          team: team, // The team/player being bet on
          betType: 'future',
          bet: betString,
          odds: odds,
          stake: parseFloat(stake.toFixed(2)),
          status: 'pending',
          book: bookmaker
        });
        
        showToast(`Future added: ${team} ${formatOdds(odds)}`, 'success');
      } catch (error) {
        console.error('Error creating bet:', error);
        showToast('Failed to add bet', 'error');
      }
      
      setHoldingKey(null);
    }, 1500); // 1.5 second hold
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
    setHoldingKey(null);
  };

  // Function to get last name from full name
  const getLastName = (fullName: string): string => {
    const nameParts = fullName.split(' ');
    return nameParts[nameParts.length - 1];
  };

  // Bookmaker logos mapping with type annotation
  const bookmakerLogos: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png',
  'Caesars': '/bookmaker-logos/caesars.png',
  'BetOnline.ag': '/bookmaker-logos/betonline.png'
  };

  // Custom CSS for handling Masters mobile display
  const mobileLastNameStyle = {
    display: 'inline-block',
    marginLeft: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    position: 'relative' as const,
    zIndex: 10,
    whiteSpace: 'nowrap' as const,
  };

  // Custom display for team cell based on whether it's Masters and screen size
  const renderTeamCell = (team: string, isElite: boolean = false, eliteDetails?: EliteTeamData) => {
    const teamLogoSrc = `/team-logos/${team.toLowerCase().replace(/\s+/g, '')}.png`;
    const lastName = getLastName(team);
    
    if (isMasters) {
      // For Masters - specialized approach with direct styles
      return (
        <div className="flex items-center" style={{ width: '100%', display: 'flex', alignItems: 'center' }}>
          <img 
            src={teamLogoSrc}
            alt=""
            className="h-5 w-5 mr-1"
            style={{ height: '20px', width: '20px', marginRight: '4px', flexShrink: 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          
          {/* Always show last name on mobile */}
          <span className="sm:hidden" style={mobileLastNameStyle}>
            {lastName}
          </span>
          
          {/* Show full name on desktop/tablet */}
          <span className="hidden sm:inline">
            {team}
          </span>
        </div>
      );
    } else {
      // For non-Masters tabs
      return (
        <div className="flex items-center gap-1">
          <img 
            src={teamLogoSrc}
            alt=""
            className="h-5 w-5 mr-2"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          {!compactMode ? (
            <span>{team}</span>
          ) : (
            <span className="sm:inline hidden">{team}</span>
          )}
          {/* Elite badge for NCAAB */}
          {isElite && (
            <span 
              className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200"
              title={eliteDetails ? `Top 25 in both Offense (#${eliteDetails.rankOE}) and Defense (#${eliteDetails.rankDE})` : 'Top 25 in both Offense and Defense'}
            >
              Elite
            </span>
          )}
        </div>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ease-in-out">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Banner notice for Masters on mobile */}
      {isMasters && (
        <div className="sm:hidden bg-blue-50 p-2 text-center border-b border-blue-100">
          <p className="text-xs text-blue-800 font-medium">
            ↔️ Rotate phone horizontally to see golfer names
          </p>
        </div>
      )}
      
      {/* Header with title and optional elite teams indicator */}
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-sm md:text-lg font-semibold text-gray-900">
            {market.title}
          </h3>
          {league === 'basketball_ncaab' && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              {eliteLoading ? (
                <span className="flex items-center gap-1">
                  <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  Loading KenPom...
                </span>
              ) : eliteTeamsNormalized.size > 0 ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-3 h-3 bg-green-100 border border-green-300 rounded"></span>
                  Top 25 O &amp; D ({eliteTeamsNormalized.size})
                </span>
              ) : null}
            </div>
          )}
        </div>
        {/* Elite teams disclaimer for NCAAB */}
        {league === 'basketball_ncaab' && eliteTeamsNormalized.size > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 font-medium">
              Elite
            </span>
            <span>represents teams that can win it all based on Offensive &amp; Defensive Efficiency</span>
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              {displayBookmakers.map(book => (
                <th key={book} className="px-2 md:px-4 py-2 md:py-3 text-center">
                  <img src={bookmakerLogos[book]} alt={book} className="h-6 mx-auto" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {market.teams.map((item, index) => {
              // Determine best odds (only among displayed bookmakers)
              let bestOddsValue = -Infinity;
              let bestOddsBooks: string[] = [];
              
              displayBookmakers.forEach(book => {
                if (item.odds[book] !== undefined) {
                  if (item.odds[book] > bestOddsValue) {
                    bestOddsValue = item.odds[book];
                    bestOddsBooks = [book];
                  } else if (item.odds[book] === bestOddsValue) {
                    bestOddsBooks.push(book);
                  }
                }
              });

              // Check if this team is elite (NCAAB only)
              const teamIsElite = isEliteTeam(item.team);
              const eliteDetails = teamIsElite ? getEliteDetails(item.team) : undefined;
              
              return (
                <tr 
                  key={index}
                  className={teamIsElite ? 'bg-green-50' : ''}
                  title={eliteDetails ? `KenPom: O#${eliteDetails.rankOE}, D#${eliteDetails.rankDE}, Overall#${eliteDetails.rankEM}` : undefined}
                >
                  <td className="px-2 md:px-4 py-3 whitespace-normal text-xs md:text-sm font-medium text-gray-900">
                    {renderTeamCell(item.team, teamIsElite, eliteDetails)}
                  </td>
                  {displayBookmakers.map(book => {
                    const cellKey = `${item.team}-${book}`;
                    const isThisCellHolding = holdingKey === cellKey;
                    const hasOdds = item.odds[book] !== undefined;
                    
                    return (
                      <td 
                        key={book} 
                        className={`px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none ${
                          isThisCellHolding ? 'bg-blue-50' : teamIsElite ? 'bg-green-50' : ''
                        }`}
                        onTouchStart={() => hasOdds && handlePressStart(item.team, item.odds[book], book, cellKey)}
                        onTouchEnd={handlePressEnd}
                        onTouchMove={handlePressEnd}
                        onMouseDown={() => hasOdds && handlePressStart(item.team, item.odds[book], book, cellKey)}
                        onMouseUp={handlePressEnd}
                        onMouseLeave={handlePressEnd}
                      >
                        {hasOdds ? (
                          <div className={`text-xs md:text-sm font-medium ${
                            bestOddsBooks.includes(book) ? 'text-green-600 font-bold' : 'text-gray-900'
                          } ${isThisCellHolding ? 'opacity-50' : ''}`}>
                            {formatOdds(item.odds[book])}
                            {bestOddsBooks.includes(book) && (
                              <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Best
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs md:text-sm text-gray-500">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
