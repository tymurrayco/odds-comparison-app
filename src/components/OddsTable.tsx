// src/components/OddsTable.tsx
'use client';

import { useRef, useState } from 'react';
import { Game, BOOKMAKERS } from '@/lib/api';
import { formatOdds } from '@/lib/utils';
import { createBet } from '@/lib/betService';

interface OddsTableProps {
  games: Game[];
  view?: 'moneyline' | 'spread' | 'totals' | 'spreads_h1';
  compactMode?: boolean;
  league?: string; // Add league prop for bet creation
}

interface OddsItem {
  bookmaker: string;
  price: number;
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

export default function OddsTable({ games, view = 'moneyline', compactMode = false, league = 'basketball_nba' }: OddsTableProps) {
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  if (!games || games.length === 0) {
    return <div className="p-4">No games available</div>;
  }

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Handle press-and-hold to create bet
  const handlePressStart = (
    game: Game,
    team: string,
    odds: number,
    bookmaker: string,
    betType: 'spread' | 'total' | 'moneyline',
    point?: number,
    totalType?: 'Over' | 'Under'
  ) => {
    setIsHolding(true);
    pressTimer.current = setTimeout(async () => {
      // Calculate stake for 1 unit to-win
      const stake = calculateStakeForOneUnit(odds);
      
      // Create bet description
      let betDescription = '';
      if (betType === 'spread') {
        const sign = point! > 0 ? '+' : '';
        betDescription = `${team} ${sign}${point}`;
      } else if (betType === 'total') {
        betDescription = `${totalType} ${point}`;
      } else {
        // Moneyline
        betDescription = `${team} ML`;
      }
      
      // Create full description
      const fullDescription = `${game.away_team} @ ${game.home_team}`;
      
      try {
        // Format date in local timezone to avoid UTC conversion issues
        const eventDate = new Date(game.commence_time);
        const eventDateString = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        
        await createBet({
          date: new Date().toISOString().split('T')[0],
          eventDate: eventDateString,
          sport: getSportFromLeague(league),
          league: getLeagueDisplayName(league),
          description: fullDescription,
          awayTeam: game.away_team,
          homeTeam: game.home_team,
          team: betType === 'spread' || betType === 'moneyline' ? team : undefined,
          betType: betType,
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
      
      setIsHolding(false);
    }, 1500); // 1.5 second hold
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
    setIsHolding(false);
  };

  // Bookmaker logos mapping with type annotation
  const bookmakerLogos: { [key: string]: string } = {
    'DraftKings': '/bookmaker-logos/draftkings.png',
    'FanDuel': '/bookmaker-logos/fd.png',
    'BetMGM': '/bookmaker-logos/betmgm.png',
    'BetRivers': '/bookmaker-logos/betrivers.png'
  };
  
  // Map market keys
  const marketKey = view === 'moneyline' ? 'h2h' : 
                   view === 'spread' ? 'spreads' : 
                   view === 'spreads_h1' ? 'spreads_h1' : 'totals';

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ease-in-out">
          <div className={`px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          } text-white font-medium`}>
            {toast.message}
          </div>
        </div>
      )}

      {games.map(game => {
        // For each team, calculate which bookmakers offer the best odds
        const bestBookmakersByTeam: { [key: string]: string[] } = {};
        
        // Calculate best bookmakers for moneyline
        if (marketKey === 'h2h') {
          // For each team, find all available odds
          [game.away_team, game.home_team].forEach(team => {
            const allOdds: OddsItem[] = [];
            
            // Collect all odds for this team
            BOOKMAKERS.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === 'h2h');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === team);
              if (!outcome) return;
              
              allOdds.push({
                bookmaker: book,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[team] = [];
              return;
            }
            
            // Find the best odds value
            let bestPrice = allOdds[0].price;
            allOdds.forEach(odds => {
              // Compare based on favoritism
              if (bestPrice < 0 && odds.price < 0) {
                // Both negative (favorites) - less negative is better
                if (odds.price > bestPrice) {
                  bestPrice = odds.price;
                }
              } else if (bestPrice > 0 && odds.price > 0) {
                // Both positive (underdogs) - more positive is better
                if (odds.price > bestPrice) {
                  bestPrice = odds.price;
                }
              } else {
                // Mixed case - positive always beats negative
                if (odds.price > 0 && bestPrice < 0) {
                  bestPrice = odds.price;
                }
              }
            });
            
            // Find all bookmakers with the best price
            const bestBookmakers = allOdds
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
            
            bestBookmakersByTeam[team] = bestBookmakers;
          });
        }
        
        // Pre-calculate best bookmakers for spreads and 1H spreads
        if (marketKey === 'spreads' || marketKey === 'spreads_h1') {
          [game.away_team, game.home_team].forEach(teamName => {
            const allOdds: { bookmaker: string, point: number, price: number }[] = [];
            
            // Collect all odds for this team
            BOOKMAKERS.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === marketKey);
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === teamName);
              if (!outcome || typeof outcome.point === 'undefined') return;
              
              allOdds.push({
                bookmaker: book,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[teamName] = [];
              return;
            }
            
            // Find the best spread value
            const bestPoint = Math.max(...allOdds.map(odds => odds.point));
            
            // Get all bookmakers with the best point
            const bookiesWithBestPoint = allOdds.filter(odds => odds.point === bestPoint);
            
            // If only one bookmaker has the best point, it's the best
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[teamName] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Find the best price among bookmakers with the best point
            const bestPrice = Math.max(...bookiesWithBestPoint.map(odds => odds.price));
            
            // All bookmakers with both the best point and the best price are "best"
            bestBookmakersByTeam[teamName] = bookiesWithBestPoint
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
          });
        }
        
        // Pre-calculate best bookmakers for totals
        if (marketKey === 'totals') {
          // For totals we associate Over with away team and Under with home team
          const totalTypes = ['Over', 'Under'];
          const teams = [game.away_team, game.home_team];
          
          teams.forEach((teamName, index) => {
            const totalType = totalTypes[index];
            const allOdds: { bookmaker: string, point: number, price: number }[] = [];
            
            // Collect all odds for this total type
            BOOKMAKERS.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === 'totals');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === totalType);
              if (!outcome || typeof outcome.point === 'undefined') return;
              
              allOdds.push({
                bookmaker: book,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[teamName] = [];
              return;
            }
            
            // Find the best point value (lowest for Over, highest for Under)
            const bestPoint = totalType === 'Over' ?
              Math.min(...allOdds.map(odds => odds.point)) :
              Math.max(...allOdds.map(odds => odds.point));
            
            // Get all bookmakers with the best point
            const bookiesWithBestPoint = allOdds.filter(odds => odds.point === bestPoint);
            
            // If only one bookmaker has the best point, it's the best
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[teamName] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Find the best price among bookmakers with the best point
            const bestPrice = Math.max(...bookiesWithBestPoint.map(odds => odds.price));
            
            // All bookmakers with both the best point and the best price are "best"
            bestBookmakersByTeam[teamName] = bookiesWithBestPoint
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
          });
        }
        
        return (
          <table key={game.id} className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                {BOOKMAKERS.map(book => (
                  <th key={book} className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <img src={bookmakerLogos[book]} alt={book} className="h-6 mx-auto" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[game.away_team, game.home_team].map((team, index) => {
                return (
                  <tr key={team} className={index === 0 ? "border-b" : ""}>
                    <td className="px-2 md:px-4 py-3 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900 truncate max-w-[120px]">
                      <div className="flex items-center">
                        <img 
                          src={`/team-logos/${team.toLowerCase().replace(/\s+/g, '')}.png`}
                          alt=""
                          className="h-5 w-5 mr-2"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        {/* Show team name only on desktop if compactMode is true */}
                        {!compactMode ? (
                          team
                        ) : (
                          <span className="sm:inline hidden">{team}</span>
                        )}
                      </div>
                    </td>
                    
                    {BOOKMAKERS.map(book => {
                      const bookieData = game.bookmakers.find(b => b.title === book);
                      
                      // Check if this is one of the best bookmakers for this team
                      const isBest = bestBookmakersByTeam[team]?.includes(book) || false;
                      
                      if (marketKey === 'h2h') {
                        const marketData = bookieData?.markets.find(m => m.key === 'h2h');
                        const outcomeData = marketData?.outcomes.find(o => o.name === team);
                        
                        return (
                          <td 
                            key={book} 
                            className="px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none"
                            onTouchStart={() => outcomeData && 
                              handlePressStart(game, team, outcomeData.price, book, 'moneyline')}
                            onTouchEnd={handlePressEnd}
                            onTouchMove={handlePressEnd}
                            onMouseDown={() => outcomeData && 
                              handlePressStart(game, team, outcomeData.price, book, 'moneyline')}
                            onMouseUp={handlePressEnd}
                            onMouseLeave={handlePressEnd}
                          >
                            {outcomeData ? (
                              <div className={`text-xs md:text-sm font-medium ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              } ${isHolding ? 'opacity-50' : ''}`}>
                                {formatOdds(outcomeData.price)}
                                {isBest && (
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
                      }
                      
                      if (marketKey === 'spreads' || marketKey === 'spreads_h1') {
                        const marketData = bookieData?.markets.find(m => m.key === marketKey);
                        const outcomeData = marketData?.outcomes.find(o => o.name === team);
                        
                        return (
                          <td 
                            key={book} 
                            className="px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none"
                            onTouchStart={() => outcomeData && typeof outcomeData.point !== 'undefined' && 
                              handlePressStart(game, team, outcomeData.price, book, 'spread', outcomeData.point)}
                            onTouchEnd={handlePressEnd}
                            onTouchMove={handlePressEnd}
                            onMouseDown={() => outcomeData && typeof outcomeData.point !== 'undefined' && 
                              handlePressStart(game, team, outcomeData.price, book, 'spread', outcomeData.point)}
                            onMouseUp={handlePressEnd}
                            onMouseLeave={handlePressEnd}
                          >
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              } ${isHolding ? 'opacity-50' : ''}`}>
                                {outcomeData.point > 0 ? '+' : ''}{outcomeData.point} ({formatOdds(outcomeData.price)})
                                {isBest && (
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
                      }
                      
                      if (marketKey === 'totals') {
                        const marketData = bookieData?.markets.find(m => m.key === 'totals');
                        const totalType = index === 0 ? 'Over' : 'Under';
                        const outcomeData = marketData?.outcomes.find(o => 
                          (index === 0 && o.name === 'Over') || (index === 1 && o.name === 'Under')
                        );
                        
                        return (
                          <td 
                            key={book} 
                            className="px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none"
                            onTouchStart={() => outcomeData && typeof outcomeData.point !== 'undefined' && 
                              handlePressStart(game, team, outcomeData.price, book, 'total', outcomeData.point, totalType)}
                            onTouchEnd={handlePressEnd}
                            onTouchMove={handlePressEnd}
                            onMouseDown={() => outcomeData && typeof outcomeData.point !== 'undefined' && 
                              handlePressStart(game, team, outcomeData.price, book, 'total', outcomeData.point, totalType)}
                            onMouseUp={handlePressEnd}
                            onMouseLeave={handlePressEnd}
                          >
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              } ${isHolding ? 'opacity-50' : ''}`}>
                                {index === 0 ? 'O' : 'U'} {outcomeData.point} ({formatOdds(outcomeData.price)})
                                {isBest && (
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
                      }
                      
                      return <td key={book} className="px-2 md:px-4 py-3 text-center">-</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}