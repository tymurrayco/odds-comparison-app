// src/components/GameCard.tsx
import { useState } from 'react';
import OddsTable from './OddsTable';
import TeamAnalysis from './TeamAnalysis';
import { Game } from '@/lib/api';

interface GameCardProps {
  game: Game;
}

export default function GameCard({ game }: GameCardProps) {
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
  
  // Check if game is live
  const now = new Date();
  const isLive = now > gameDate;
  
  // Helper function to get first word of team name
  const getFirstWord = (teamName: string): string => {
    return teamName.split(' ')[0];
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
            <div className="flex items-center">
              <h3 className="text-sm md:text-lg font-semibold text-gray-900 truncate">
                {game.away_team} @ {game.home_team}
              </h3>
              {isLive && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                  LIVE
                </span>
              )}
            </div>
            
            {/* Game time and implied result */}
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs md:text-sm text-gray-500">
                {formattedDate} at {formattedTime} {timeZoneAbbr}
              </p>
              
              {/* Implied Score with team names - winner always on left */}
              {impliedScores && (
                <div className="flex items-center gap-1.5 text-xs md:text-sm">
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-600">
                    Implied: 
                    {impliedScores.awayWinning ? (
                      <>
                        <span className="font-bold">
                          {' '}{getFirstWord(impliedScores.awayTeam)} {impliedScores.away}
                        </span>
                        <span> - </span>
                        <span>
                          {getFirstWord(impliedScores.homeTeam)} {impliedScores.home}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold">
                          {' '}{getFirstWord(impliedScores.homeTeam)} {impliedScores.home}
                        </span>
                        <span> - </span>
                        <span>
                          {getFirstWord(impliedScores.awayTeam)} {impliedScores.away}
                        </span>
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
              Moneyline
            </button>
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'totals' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('totals')}
            >
              Totals
            </button>
            {/* Only show Analysis tab for NCAAF games */}
            {isNCAAF && (
              <button 
                className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                  expandedMarket === 'analysis' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setExpandedMarket('analysis')}
              >
                Analysis
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Content area based on selected tab */}
      {expandedMarket === 'analysis' && isNCAAF ? (
        <TeamAnalysis 
          awayTeam={game.away_team}
          homeTeam={game.home_team}
        />
      ) : (
        /* Odds table for other tabs */
        <div className="overflow-x-auto">
          <OddsTable 
            games={[game]}
            view={expandedMarket === 'spread' ? 'spread' : 
                  expandedMarket === 'moneyline' ? 'moneyline' : 
                  'totals'}
            compactMode={true}
            league={game.sport_key}
          />
        </div>
      )}
    </div>
  );
}