// src/components/PropsTable.tsx
'use client';

import React, { useState, useRef } from 'react';
import { ProcessedPropsMarket, ProcessedProp, PropsEvent, BOOKMAKERS } from '@/lib/api';
import { createBet } from '@/lib/betService';

interface PropsTableProps {
  markets: ProcessedPropsMarket[];
  selectedBookmakers?: string[];
  playerFilter?: string;
  event?: PropsEvent; // The selected game/event for context
  league?: string; // The active league
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
  if (league.includes('nhl') || league.includes('icehockey')) return 'Hockey';
  if (league.includes('mlb') || league.includes('baseball')) return 'Baseball';
  if (league.includes('mls') || league.includes('soccer')) return 'Soccer';
  if (league.includes('epl') || league.includes('soccer')) return 'Soccer';
  if (league.includes('wnba')) return 'Basketball';
  return 'Other';
}

// Helper function to get league display name
function getLeagueDisplayName(league: string): string {
  const leagueMap: { [key: string]: string } = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'baseball_mlb': 'MLB',
    'soccer_usa_mls': 'MLS',
    'soccer_epl': 'EPL',
    'basketball_wnba': 'WNBA'
  };
  return leagueMap[league] || league.toUpperCase();
}

export default function PropsTable({ 
  markets, 
  selectedBookmakers,
  playerFilter = '',
  event,
  league = 'basketball_nba'
}: PropsTableProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<{ [key: string]: boolean }>({});
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [holdingKey, setHoldingKey] = useState<string | null>(null); // Track which cell is being held
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Use selected bookmakers or default to all
  const displayBookmakers = selectedBookmakers && selectedBookmakers.length > 0 
    ? BOOKMAKERS.filter(b => selectedBookmakers.includes(b))
    : BOOKMAKERS;

  const formatOdds = (odds: number | null): string => {
    if (odds === null) return '-';
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle press-and-hold to create prop bet
  const handlePressStart = (
    prop: ProcessedProp,
    bookmaker: string,
    line: number,
    odds: number,
    overUnder: 'Over' | 'Under',
    cellKey: string
  ) => {
    if (!event) return; // Need event context to create bet
    
    setHoldingKey(cellKey);
    
    pressTimer.current = setTimeout(async () => {
      // Calculate stake for 1 unit to-win
      const stake = calculateStakeForOneUnit(odds);
      
      // Create bet description: "Player Name Over/Under Line (Market)"
      // e.g., "Anthony Davis Over 24.5 Points"
      const betDescription = `${prop.playerName} ${overUnder} ${line} ${prop.marketName}`;
      
      // Create full description (game matchup)
      const fullDescription = `${event.away_team} @ ${event.home_team}`;
      
      try {
        // Format date in local timezone to avoid UTC conversion issues
        const eventDate = new Date(event.commence_time);
        const eventDateString = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        
        await createBet({
          date: new Date().toISOString().split('T')[0],
          eventDate: eventDateString,
          sport: getSportFromLeague(league),
          league: getLeagueDisplayName(league),
          description: fullDescription,
          awayTeam: event.away_team,
          homeTeam: event.home_team,
          team: undefined, // Props don't have a specific team selection
          betType: 'prop',
          bet: betDescription,
          odds: odds,
          stake: parseFloat(stake.toFixed(2)),
          status: 'pending',
          book: bookmaker
        });
        
        showToast(`Bet added: ${betDescription} (${formatOdds(odds)})`, 'success');
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

  // Bookmaker logos mapping
  const bookmakerLogos: { [key: string]: string } = {
    'DraftKings': '/bookmaker-logos/draftkings.png',
    'FanDuel': '/bookmaker-logos/fd.png',
    'BetMGM': '/bookmaker-logos/betmgm.png',
    'BetRivers': '/bookmaker-logos/betrivers.png',
    'Caesars': '/bookmaker-logos/caesars.png',
    'BetOnline.ag': '/bookmaker-logos/betonline.png'
  };

  // Toggle market expansion
  const toggleMarket = (marketKey: string) => {
    setExpandedMarkets(prev => ({
      ...prev,
      [marketKey]: !prev[marketKey]
    }));
  };

  // Filter props by player name
  const filterProps = (props: ProcessedProp[]): ProcessedProp[] => {
    if (!playerFilter.trim()) return props;
    const searchTerm = playerFilter.toLowerCase().trim();
    return props.filter(prop => 
      prop.playerName.toLowerCase().includes(searchTerm)
    );
  };

  // Find best odds for over and under across bookmakers (considering same line)
  const findBestOdds = (prop: ProcessedProp): { bestOver: string[], bestUnder: string[] } => {
    let bestOverValue = -Infinity;
    let bestUnderValue = -Infinity;
    let bestOver: string[] = [];
    let bestUnder: string[] = [];

    displayBookmakers.forEach(book => {
      const odds = prop.odds[book];
      if (odds) {
        if (odds.over !== null) {
          if (odds.over > bestOverValue) {
            bestOverValue = odds.over;
            bestOver = [book];
          } else if (odds.over === bestOverValue) {
            bestOver.push(book);
          }
        }
        if (odds.under !== null) {
          if (odds.under > bestUnderValue) {
            bestUnderValue = odds.under;
            bestUnder = [book];
          } else if (odds.under === bestUnderValue) {
            bestUnder.push(book);
          }
        }
      }
    });

    return { bestOver, bestUnder };
  };

  if (!markets || markets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No player props available for this game.
      </div>
    );
  }

  // Filter markets to only show those with matching props
  const filteredMarkets = markets.map(market => ({
    ...market,
    props: filterProps(market.props)
  })).filter(market => market.props.length > 0);

  if (filteredMarkets.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No props found matching &quot;{playerFilter}&quot;
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {filteredMarkets.map((market) => {
        // Default to collapsed (false) if not set, otherwise use the stored value
        const isExpanded = expandedMarkets[market.marketKey] ?? false;
        
        return (
          <div key={market.marketKey} className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Market Header - Click to toggle */}
            <div 
              className="p-3 md:p-4 border-b border-blue-400 bg-blue-500 cursor-pointer flex items-center justify-between hover:bg-blue-600 transition-colors"
              onClick={() => toggleMarket(market.marketKey)}
            >
              <h3 className="text-sm md:text-lg font-semibold text-white">
                {market.marketName}
                <span className="ml-2 text-xs md:text-sm font-normal text-blue-100">
                  ({market.props.length} player{market.props.length !== 1 ? 's' : ''})
                </span>
              </h3>
              <svg 
                className={`w-5 h-5 text-white transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            
            {/* Props Table - Only show when expanded */}
            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-blue-700 uppercase tracking-wider min-w-[140px]">
                        Player
                      </th>
                      {displayBookmakers.map(book => (
                        <th key={book} className="px-1 md:px-3 py-2 md:py-3 text-center min-w-[80px]">
                          <img src={bookmakerLogos[book]} alt={book} className="h-5 md:h-6 mx-auto" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {market.props.map((prop, index) => {
                      const { bestOver, bestUnder } = findBestOdds(prop);
                      
                      return (
                        <tr key={`${prop.playerName}-${index}`} className="hover:bg-gray-50">
                          <td className="px-2 md:px-4 py-2 md:py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">
                            <span className="truncate max-w-[120px] md:max-w-none">
                              {prop.playerName}
                            </span>
                          </td>
                          {displayBookmakers.map(book => {
                            const odds = prop.odds[book];
                            const isOverBest = bestOver.includes(book);
                            const isUnderBest = bestUnder.includes(book);
                            const hasData = odds && (odds.over !== null || odds.under !== null);
                            const cellKey = `${prop.playerName}-${book}-${market.marketKey}`;
                            const isThisCellHolding = holdingKey === cellKey || holdingKey === `${cellKey}-over` || holdingKey === `${cellKey}-under`;
                            
                            return (
                              <td 
                                key={`${book}-${prop.playerName}`}
                                className="px-1 md:px-3 py-2 md:py-3 whitespace-nowrap text-center border-r border-gray-100 last:border-r-0"
                              >
                                {hasData ? (
                                  <div className={`flex flex-col items-center gap-0.5 ${isThisCellHolding ? 'opacity-50' : ''}`}>
                                    {/* Line */}
                                    <span className="text-[10px] md:text-xs font-semibold text-gray-700">
                                      {odds.line}
                                    </span>
                                    {/* Over/Under odds - each clickable separately */}
                                    <div className="flex gap-1 text-[10px] md:text-xs">
                                      {/* Over button */}
                                      <span 
                                        className={`cursor-pointer select-none ${isOverBest ? 'text-green-600 font-bold' : 'text-gray-600'} ${holdingKey === `${cellKey}-over` ? 'ring-2 ring-blue-400 rounded' : ''}`}
                                        onTouchStart={() => odds.over !== null && odds.line !== undefined && 
                                          handlePressStart(prop, book, odds.line!, odds.over, 'Over', `${cellKey}-over`)}
                                        onTouchEnd={handlePressEnd}
                                        onTouchMove={handlePressEnd}
                                        onMouseDown={() => odds.over !== null && odds.line !== undefined && 
                                          handlePressStart(prop, book, odds.line!, odds.over, 'Over', `${cellKey}-over`)}
                                        onMouseUp={handlePressEnd}
                                        onMouseLeave={handlePressEnd}
                                      >
                                        o{formatOdds(odds.over)}
                                      </span>
                                      <span className="text-gray-300">/</span>
                                      {/* Under button */}
                                      <span 
                                        className={`cursor-pointer select-none ${isUnderBest ? 'text-green-600 font-bold' : 'text-gray-600'} ${holdingKey === `${cellKey}-under` ? 'ring-2 ring-blue-400 rounded' : ''}`}
                                        onTouchStart={() => odds.under !== null && odds.line !== undefined && 
                                          handlePressStart(prop, book, odds.line!, odds.under, 'Under', `${cellKey}-under`)}
                                        onTouchEnd={handlePressEnd}
                                        onTouchMove={handlePressEnd}
                                        onMouseDown={() => odds.under !== null && odds.line !== undefined && 
                                          handlePressStart(prop, book, odds.line!, odds.under, 'Under', `${cellKey}-under`)}
                                        onMouseUp={handlePressEnd}
                                        onMouseLeave={handlePressEnd}
                                      >
                                        u{formatOdds(odds.under)}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[11px] md:text-sm text-gray-400">-</span>
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
            )}
          </div>
        );
      })}
    </div>
  );
}