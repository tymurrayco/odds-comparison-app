// src/components/LeagueNav.tsx
import { useState, useEffect } from 'react';
import { LEAGUES } from '@/lib/api';

interface LeagueNavProps {
  activeLeague: string;
  setActiveLeague: (league: string) => void;
  onRefresh: () => void;
  lastUpdated: Date;
  apiRequestsRemaining?: string | null;
  favoritesCount?: number;
}

export default function LeagueNav({ 
  activeLeague, 
  setActiveLeague, 
  onRefresh, 
  lastUpdated,
  apiRequestsRemaining,
  favoritesCount = 0
}: LeagueNavProps) {
  const [timeString, setTimeString] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  useEffect(() => {
    setTimeString(lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [lastUpdated]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  // Format API requests remaining - remove decimals and add commas
  const formatNumber = (numStr: string | null) => {
    if (!numStr) return null;
    // Parse as float, round to integer, then format with commas
    return Math.round(parseFloat(numStr)).toLocaleString();
  };

  const formattedRequests = apiRequestsRemaining ? formatNumber(apiRequestsRemaining) : null;

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
      <div className="flex flex-col sm:flex-row justify-between mb-2">
        <div className="flex flex-wrap gap-2 mb-2 sm:mb-0">
          {/* Favorites option */}
          <button
            className={`px-4 py-2 rounded-full flex items-center gap-1 ${
              activeLeague === 'favorites'
                ? 'bg-yellow-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => setActiveLeague('favorites')}
          >
            <span>★</span>
            {favoritesCount > 0 && (
              <span className="text-xs">({favoritesCount})</span>
            )}
          </button>
          
          {LEAGUES.filter(league => league.isActive).map(league => (
            <button
              key={league.id}
              className={`px-4 py-2 rounded-full ${
                activeLeague === league.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setActiveLeague(league.id)}
            >
              {league.name}
            </button>
          ))}
        </div>
        
        <div className="flex items-center text-sm text-gray-500">
          {timeString && <span className="mr-2">Updated: {timeString}</span>}
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`px-3 py-1 rounded ${
              isRefreshing 
                ? 'bg-gray-100 text-gray-400' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            {isRefreshing ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Refreshing...
              </span>
            ) : 'Refresh'}
          </button>
          
          {/* Display formatted API requests remaining */}
          {formattedRequests && (
            <span className="ml-2 px-2 py-1 bg-gray-100 rounded-full text-xs">
              {formattedRequests}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}