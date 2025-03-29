// src/components/OddsTable.tsx
import { Game, BOOKMAKERS } from '@/lib/api';
import { formatOdds } from '@/lib/utils';

interface OddsTableProps {
  games: Game[];
  view?: 'moneyline' | 'spread' | 'totals';
}

export default function OddsTable({ games, view = 'moneyline' }: OddsTableProps) {
  if (!games || games.length === 0) {
    return <div className="p-4">No games available</div>;
  }

  // Bookmaker logos mapping
  const bookmakerLogos = {
    'DraftKings': '/bookmaker-logos/draftkings.png',
    'FanDuel': '/bookmaker-logos/fd.png',
    'BetMGM': '/bookmaker-logos/betmgm.png',
    'Caesars': '/bookmaker-logos/caesars.png'
  };
  
  // Map market keys
  const marketKey = view === 'moneyline' ? 'h2h' : view === 'spread' ? 'spreads' : 'totals';

  return (
    <div>
      {games.map(game => {
        // For each team, calculate which bookmakers offer the best odds
        const bestBookmakersByTeam = {};
        
        // Calculate best bookmakers for moneyline
        if (marketKey === 'h2h') {
          // For each team, find all available odds
          [game.away_team, game.home_team].forEach(team => {
            const allOdds = [];
            
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
        } else if (marketKey === 'spreads') {
          [game.away_team, game.home_team].forEach(team => {
            const allLines = [];
  
            // Collect all lines from all bookmakers for this team
            game.bookmakers.forEach(bookmaker => {
              const market = bookmaker.markets.find(m => m.key === 'spreads');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === team);
              if (!outcome) return;
              
              allLines.push({
                bookmaker: bookmaker.title,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allLines.length === 0) {
              bestBookmakersByTeam[team] = [];
              return;
            }
            
            // For both favorites and underdogs, higher point value is better
            let bestPoint = allLines[0].point;
            
            allLines.forEach(line => {
              if (line.point > bestPoint) {
                bestPoint = line.point;
              }
            });
            
            // Get all bookmakers with best point
            const bookiesWithBestPoint = allLines.filter(line => line.point === bestPoint);
            
            // If only one has the best point, that's our winner
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[team] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Otherwise, find best juice (highest price is best)
            let bestJuice = bookiesWithBestPoint[0].price;
            
            bookiesWithBestPoint.forEach(line => {
              if (line.price > bestJuice) {
                bestJuice = line.price;
              }
            });
            
            // Return all bookmakers with best point and best juice
            bestBookmakersByTeam[team] = bookiesWithBestPoint
              .filter(line => line.price === bestJuice)
              .map(line => line.bookmaker);
          });
        } else if (marketKey === 'totals') {
          [game.away_team, game.home_team].forEach((team, index) => {
            const isOver = index === 0; // Away team uses Over, home team uses Under
            const totalsName = isOver ? 'Over' : 'Under';
            const allLines = [];
  
            // Collect all lines from all bookmakers
            game.bookmakers.forEach(bookmaker => {
              const market = bookmaker.markets.find(m => m.key === 'totals');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === totalsName);
              if (!outcome) return;
              
              allLines.push({
                bookmaker: bookmaker.title,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allLines.length === 0) {
              bestBookmakersByTeam[team] = [];
              return;
            }
            
            // Find best point (lower for Over, higher for Under)
            let bestPoint = allLines[0].point;
            
            allLines.forEach(line => {
              if ((isOver && line.point < bestPoint) || (!isOver && line.point > bestPoint)) {
                bestPoint = line.point;
              }
            });
            
            // Get all bookmakers with best point
            const bookiesWithBestPoint = allLines.filter(line => line.point === bestPoint);
            
            // If only one has the best point, that's our winner
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[team] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Otherwise, find best juice (highest price is best)
            let bestJuice = bookiesWithBestPoint[0].price;
            
            bookiesWithBestPoint.forEach(line => {
              if (line.price > bestJuice) {
                bestJuice = line.price;
              }
            });
            
            // Return all bookmakers with best point and best juice
            bestBookmakersByTeam[team] = bookiesWithBestPoint
              .filter(line => line.price === bestJuice)
              .map(line => line.bookmaker);
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
                        {team}
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
                          <td key={book} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                            {outcomeData ? (
                              <div className={`text-xs md:text-sm font-medium ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
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
                      
                      if (marketKey === 'spreads') {
                        const marketData = bookieData?.markets.find(m => m.key === 'spreads');
                        const outcomeData = marketData?.outcomes.find(o => o.name === team);
                        
                        return (
                          <td key={book} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                            {outcomeData ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
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
                        const outcomeData = marketData?.outcomes.find(o => 
                          (index === 0 && o.name === 'Over') || (index === 1 && o.name === 'Under')
                        );
                        
                        return (
                          <td key={book} className="px-2 md:px-4 py-3 whitespace-nowrap text-center">
                            {outcomeData ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
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