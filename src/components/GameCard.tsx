// src/components/GameCard.tsx
import { useState } from 'react';
import OddsTable from './OddsTable';
import { Game } from '@/lib/api';

interface GameCardProps {
  game: Game;
}

export default function GameCard({ game }: GameCardProps) {
  const [expandedMarket, setExpandedMarket] = useState<'moneyline' | 'spread' | 'totals'>('spread');
  
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
  
  return (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="mb-2 sm:mb-0">
            <div className="flex items-center">
              <h3 className="text-sm md:text-lg font-semibold text-gray-900 truncate">
                {game.away_team} @ {game.home_team}
                {game.corrected_home_away && (
                  <span className="ml-2 text-xs text-gray-500">(corrected)</span>
                )}
              </h3>
              {isLive && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-greeb"></span>
                  LIVE
                </span>
              )}
            </div>
            
            {/* Game time */}
            <p className="text-xs md:text-sm text-gray-500">
              {formattedDate} at {formattedTime} {timeZoneAbbr}
            </p>
            
            {/* Show location if available */}
            {game.location && (
              <p className="mt-1 flex items-center text-xs md:text-sm text-gray-500">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className="h-3 w-3 mr-1" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" 
                  />
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" 
                  />
                </svg>
                <span>{game.location}</span>
              </p>
            )}
          </div>
          
          <div className="flex space-x-1 md:space-x-2">
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
                expandedMarket === 'totals' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('totals')}
            >
              Totals
            </button>
          </div>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <OddsTable 
          games={[game]}
          view={expandedMarket}
          compactMode={true} // Enable compact mode for mobile
        />
      </div>
    </div>
  );
}