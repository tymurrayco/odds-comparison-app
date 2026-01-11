// src/components/GameCard.tsx
import { useState } from 'react';
import OddsTable from './OddsTable';
import TeamAnalysis from './TeamAnalysis';
import { Game, ESPNGameScore } from '@/lib/api';

interface GameCardProps {
  game: Game;
  selectedBookmakers?: string[];
  isFavorite?: boolean;
  onToggleFavorite?: (gameId: string) => void;
  liveScore?: ESPNGameScore | null;
}

export default function GameCard({ game, selectedBookmakers, isFavorite = false, onToggleFavorite, liveScore }: GameCardProps) {
  // Check if this is a soccer sport
  const isSoccer = game.sport_key === 'soccer_epl' || game.sport_key === 'soccer_usa_mls';
  
  // Check if this is NCAAF
  const isNCAAF = game.sport_key === 'americanfootball_ncaaf';
  
  // Default to moneyline for soccer, spread for everything else
  const [expandedMarket, setExpandedMarket] = useState<'moneyline' | 'spread' | 'totals' | 'analysis'>(
    isSoccer ? 'moneyline' : 'spread'
  );
  
  // Format the date and time
  const gameDate = new Date(game.commence_time);
  const formattedDate = gameDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  
  // Get the user's timezone abbreviation
  const timeZoneAbbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short' })
    .formatToParts(gameDate)
    .find(part => part.type === 'timeZoneName')?.value || '';
  
  const formattedTime = gameDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  
  // Check if game is live (started but not completed)
  const now = new Date();
  const isLive = now > gameDate && liveScore?.state === 'in';
  const isCompleted = liveScore?.state === 'post';
  
  // Helper function to get first word of team name
  const getFirstWord = (teamName: string): string => {
    return teamName.split(' ')[0];
  };
  
  // Helper function to get team logo path
  const getTeamLogo = (teamName: string): string => {
    const cleanName = teamName.toLowerCase().replace(/\s+/g, '');
    return `/team-logos/${cleanName}.png`;
  };
  
  // Calculate implied scores based on average spread and total
  const calculateImpliedScores = () => {
    if (!game.bookmakers || game.bookmakers.length === 0) return null;
    
    // Collect all spreads and totals
    const spreads: number[] = [];
    const totals: number[] = [];
    let awayTeamName = '';
    let homeTeamName = '';
    
    game.bookmakers.forEach(bookmaker => {
      // Get spread market
      const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const awaySpread = spreadMarket.outcomes.find(o => o.name === game.away_team);
        const homeSpread = spreadMarket.outcomes.find(o => o.name === game.home_team);
        
        if (awaySpread && awaySpread.point !== undefined) {
          spreads.push(awaySpread.point);
          awayTeamName = game.away_team;
        }
        if (homeSpread && homeSpread.point !== undefined) {
          homeTeamName = game.home_team;
        }
      }
      
      // Get totals market
      const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
      if (totalsMarket) {
        const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
        if (overOutcome && overOutcome.point !== undefined) {
          totals.push(overOutcome.point);
        }
      }
    });
    
    // Need both spread and total to calculate
    if (spreads.length === 0 || totals.length === 0) return null;
    
    // Calculate averages
    const avgSpread = spreads.reduce((sum, s) => sum + s, 0) / spreads.length;
    const avgTotal = totals.reduce((sum, t) => sum + t, 0) / totals.length;
    
    // Calculate implied scores
    // If away team spread is negative, they're favored
    // Implied scores: Favorite gets (Total + |Spread|) / 2, Underdog gets (Total - |Spread|) / 2
    const awayImplied = (avgTotal - avgSpread) / 2;
    const homeImplied = (avgTotal + avgSpread) / 2;
    
    return {
      away: Math.round(awayImplied), // Round to whole number
      home: Math.round(homeImplied), // Round to whole number
      awayTeam: awayTeamName,
      homeTeam: homeTeamName,
      awayWinning: awayImplied > homeImplied
    };
  };
  
  const impliedScores = calculateImpliedScores();
  
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="mb-2 sm:mb-0">
            {/* Team names row */}
            <div className="flex items-center flex-wrap">
              <h3 className="text-sm md:text-lg font-semibold text-gray-900 truncate">
                {game.away_team} @ {game.home_team}
              </h3>
              {/* Favorite Star Button */}
              {onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(game.id);
                  }}
                  className={`ml-2 text-lg hover:scale-110 transition-transform ${
                    isFavorite ? 'text-yellow-500' : 'text-gray-900 hover:text-yellow-400'
                  }`}
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFavorite ? '★' : '☆'}
                </button>
              )}
              {/* Desktop only: Live/Final scores inline with team names */}
              <div className="hidden md:inline-flex">
                {/* Live indicator with score */}
                {isLive && liveScore && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1.5 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    <img 
                      src={liveScore.awayLogo || getTeamLogo(game.away_team)}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveScore.awayScore}</span>
                    <span className="mx-1">-</span>
                    <span className="font-bold">{liveScore.homeScore}</span>
                    <img 
                      src={liveScore.homeLogo || getTeamLogo(game.home_team)}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1.5 text-green-600">{liveScore.statusDetail}</span>
                  </span>
                )}
                {/* Final score */}
                {isCompleted && liveScore && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    <img 
                      src={liveScore.awayLogo || getTeamLogo(game.away_team)}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveScore.awayScore}</span>
                    <span className="mx-1">-</span>
                    <span className="font-bold">{liveScore.homeScore}</span>
                    <img 
                      src={liveScore.homeLogo || getTeamLogo(game.home_team)}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1.5 text-gray-500">Final</span>
                  </span>
                )}
                {/* Show LIVE badge without score if game started but no ESPN match */}
                {!liveScore && now > gameDate && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>
            </div>
            
            {/* Second row: Game time (pre-game) OR Live/Final + Implied scores (mobile on same line) */}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {/* Only show game time if not live/completed */}
              {!isLive && !isCompleted && (
                <p className="text-xs md:text-sm text-gray-500">
                  {formattedDate} at {formattedTime} {timeZoneAbbr}
                </p>
              )}
              
              {/* Mobile only: Live/Final scores */}
              <div className="md:hidden flex items-center">
                {/* Live indicator with score */}
                {isLive && liveScore && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    <img 
                      src={liveScore.awayLogo || getTeamLogo(game.away_team)}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveScore.awayScore}</span>
                    <span className="mx-0.5">-</span>
                    <span className="font-bold">{liveScore.homeScore}</span>
                    <img 
                      src={liveScore.homeLogo || getTeamLogo(game.home_team)}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1 text-green-600">{liveScore.statusDetail}</span>
                  </span>
                )}
                {/* Final score */}
                {isCompleted && liveScore && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    <img 
                      src={liveScore.awayLogo || getTeamLogo(game.away_team)}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveScore.awayScore}</span>
                    <span className="mx-0.5">-</span>
                    <span className="font-bold">{liveScore.homeScore}</span>
                    <img 
                      src={liveScore.homeLogo || getTeamLogo(game.home_team)}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1 text-gray-500">Final</span>
                  </span>
                )}
                {/* Show LIVE badge without score if game started but no ESPN match */}
                {!liveScore && now > gameDate && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>
              
              {/* Implied Score - always show */}
              {impliedScores && (
                <div className="flex items-center gap-1 text-xs md:text-sm">
                  {!isLive && !isCompleted && <span className="text-gray-400 hidden md:inline">•</span>}
                  {(isLive || isCompleted) && liveScore && <span className="text-gray-400">•</span>}
                  <span className="text-gray-600 flex items-center gap-0.5">
                    <span className="text-gray-500">Implied:</span>
                    {impliedScores.awayWinning ? (
                      <>
                        <img 
                          src={liveScore?.awayLogo || getTeamLogo(impliedScores.awayTeam)}
                          alt={getFirstWord(impliedScores.awayTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="font-bold">{impliedScores.away}</span>
                        <span>-</span>
                        <img 
                          src={liveScore?.homeLogo || getTeamLogo(impliedScores.homeTeam)}
                          alt={getFirstWord(impliedScores.homeTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{impliedScores.home}</span>
                      </>
                    ) : (
                      <>
                        <img 
                          src={liveScore?.homeLogo || getTeamLogo(impliedScores.homeTeam)}
                          alt={getFirstWord(impliedScores.homeTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="font-bold">{impliedScores.home}</span>
                        <span>-</span>
                        <img 
                          src={liveScore?.awayLogo || getTeamLogo(impliedScores.awayTeam)}
                          alt={getFirstWord(impliedScores.awayTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{impliedScores.away}</span>
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Market toggle buttons */}
          <div className="flex space-x-1 md:space-x-2">
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'spread' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('spread')}
            >
              Spread
            </button>
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'moneyline' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('moneyline')}
            >
              {isSoccer ? '1X2' : 'ML'}
            </button>
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'totals' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('totals')}
            >
              O/U
            </button>
            {/* Analysis button - only for NCAAF */}
            {isNCAAF && (
              <button 
                className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                  expandedMarket === 'analysis' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
                onClick={() => setExpandedMarket('analysis')}
              >
                📊
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Show TeamAnalysis if analysis is selected */}
      {expandedMarket === 'analysis' && isNCAAF ? (
        <div className="p-4">
          <TeamAnalysis awayTeam={game.away_team} homeTeam={game.home_team} />
        </div>
      ) : (
        <OddsTable 
          games={[game]} 
          view={expandedMarket === 'analysis' ? 'spread' : expandedMarket} 
          selectedBookmakers={selectedBookmakers}
          league={game.sport_key}
          awayLogo={liveScore?.awayLogo}
          homeLogo={liveScore?.homeLogo}
        />
      )}
    </div>
  );
}