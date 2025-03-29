// src/components/OddsTable.tsx
import { Game, BOOKMAKERS } from '@/lib/api';
import { formatOdds } from '@/lib/utils';

interface OddsTableProps {
  games: Game[];
  view?: 'moneyline' | 'spread' | 'totals';
  compactMode?: boolean; // Add this new prop
}

// Define interfaces for the types used in this component
interface Bookmaker {
  title: string;
  markets: Market[];
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

interface OddsItem {
  bookmaker: string;
  price: number;
}

interface LineItem {
  bookmaker: string;
  point: number;
  price: number;
}

export default function OddsTable({ games, view = 'moneyline', compactMode = false }: OddsTableProps) {
  if (!games || games.length === 0) {
    return <div className="p-4">No games available</div>;
  }

  // Bookmaker logos mapping with type annotation
  const bookmakerLogos: { [key: string]: string } = {
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
                      let isBest = false;
                      if (marketKey === 'h2h') {
                        isBest = bestBookmakersByTeam[team]?.includes(book) || false;
                      } else if (marketKey === 'spreads' || marketKey === 'totals') {
                        // For spread and totals, use the existing logic
                        isBest = checkIfBestForSpreadOrTotal(game, team, book, marketKey);
                      }
                      
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
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
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
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
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

// Helper function for spread and totals
function checkIfBestForSpreadOrTotal(game: Game, team: string, book: string, marketKey: string): boolean {
  if (marketKey === 'spreads') {
    // For spreads, we'll find the best available lines and then pick the ones with the best juice
    const allLines: LineItem[] = [];
    
    // Collect all spread lines for this team
    game.bookmakers.forEach((bookmaker: Bookmaker) => {
      const market = bookmaker.markets.find((m: Market) => m.key === 'spreads');
      if (!market) return;
      
      const outcome = market.outcomes.find((o: Outcome) => o.name === team);
      if (!outcome || typeof outcome.point === 'undefined') return;
      
      allLines.push({
        bookmaker: bookmaker.title,
        point: outcome.point,
        price: outcome.price
      });
    });
    
    if (allLines.length === 0) return false;
    
    // Get the current bookmaker's data
    const currentBookieData = allLines.find(line => line.bookmaker === book);
    if (!currentBookieData) return false;
    
    // Determine if this is a favorite (negative spread) or underdog (positive spread)
    const isFavorite = currentBookieData.point < 0;
    
    // Find the best spread value (point)
    // For favorites (negative spread), higher value (closer to zero) is better
    // For underdogs (positive spread), higher value is better
    const bestPoint = isFavorite ? 
      Math.max(...allLines.map(line => line.point)) : 
      Math.max(...allLines.map(line => line.point));
    
    // If this bookmaker doesn't have the best point, it's not the best
    if (currentBookieData.point !== bestPoint) return false;
    
    // Get all bookmakers with the best point
    const bookiesWithBestPoint = allLines.filter(line => line.point === bestPoint);
    
    // If only one bookmaker has the best point, and it's this one, it's the best
    if (bookiesWithBestPoint.length === 1 && bookiesWithBestPoint[0].bookmaker === book) {
      return true;
    }
    
    // Find the best price (juice) among bookmakers with the best point
    // Best juice is the highest price value (least negative for negative prices)
    const bestPrice = Math.max(...bookiesWithBestPoint.map(line => line.price));
    
    // This bookmaker is the best if it has both the best point and the best price
    return currentBookieData.point === bestPoint && currentBookieData.price === bestPrice;
  }
  
  if (marketKey === 'totals') {
    const isOver = team === game.away_team;
    const totalsName = isOver ? 'Over' : 'Under';
    
    // Collect all totals lines for this type (Over/Under)
    const allLines: LineItem[] = [];
    
    game.bookmakers.forEach((bookmaker: Bookmaker) => {
      const market = bookmaker.markets.find((m: Market) => m.key === 'totals');
      if (!market) return;
      
      const outcome = market.outcomes.find((o: Outcome) => o.name === totalsName);
      if (!outcome || typeof outcome.point === 'undefined') return;
      
      allLines.push({
        bookmaker: bookmaker.title,
        point: outcome.point,
        price: outcome.price
      });
    });
    
    if (allLines.length === 0) return false;
    
    // Get the current bookmaker's data
    const currentBookieData = allLines.find(line => line.bookmaker === book);
    if (!currentBookieData) return false;
    
    // Find the best point value
    // For Over bets, lower point is better
    // For Under bets, higher point is better
    const bestPoint = isOver ? 
      Math.min(...allLines.map(line => line.point)) : 
      Math.max(...allLines.map(line => line.point));
    
    // If this bookmaker doesn't have the best point, it's not the best
    if (currentBookieData.point !== bestPoint) return false;
    
    // Get all bookmakers with the best point
    const bookiesWithBestPoint = allLines.filter(line => line.point === bestPoint);
    
    // If only one bookmaker has the best point, and it's this one, it's the best
    if (bookiesWithBestPoint.length === 1 && bookiesWithBestPoint[0].bookmaker === book) {
      return true;
    }
    
    // Find the best price (juice) among bookmakers with the best point
    // Best juice is the highest price value (least negative for negative prices)
    const bestPrice = Math.max(...bookiesWithBestPoint.map(line => line.price));
    
    // This bookmaker is the best if it has both the best point and the best price
    return currentBookieData.point === bestPoint && currentBookieData.price === bestPrice;
  }
  
  return false;
}