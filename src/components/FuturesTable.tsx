// src/components/FuturesTable.tsx
'use client';

import { FuturesMarket, BOOKMAKERS } from '@/lib/api';
import { createBet } from '@/lib/betService';
import React, { useState, useRef } from 'react';

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
  const renderTeamCell = (team: string) => {
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
        <div className="flex items-center">
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
      <div className="p-3 md:p-4 border-b border-gray-200">
        <h3 className="text-sm md:text-lg font-semibold text-gray-900">
          {market.title}
        </h3>
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
              
              return (
                <tr key={index}>
                  <td className="px-2 md:px-4 py-3 whitespace-normal text-xs md:text-sm font-medium text-gray-900">
                    {renderTeamCell(item.team)}
                  </td>
                  {displayBookmakers.map(book => {
                    const cellKey = `${item.team}-${book}`;
                    const isThisCellHolding = holdingKey === cellKey;
                    const hasOdds = item.odds[book] !== undefined;
                    
                    return (
                      <td 
                        key={book} 
                        className={`px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none ${isThisCellHolding ? 'bg-blue-50' : ''}`}
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