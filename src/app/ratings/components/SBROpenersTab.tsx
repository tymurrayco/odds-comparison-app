// src/app/ratings/components/SBROpenersTab.tsx
// Tab component to display SBR opener odds

'use client';

import { useState, useEffect } from 'react';

interface SBRGame {
  awayTeam: string;
  homeTeam: string;
  openerSpread: number | null;
  isComplete: boolean;
  awayScore: number | null;
  homeScore: number | null;
  gameTime: string;
}

interface SBRResponse {
  date: string;
  scrapedAt: string;
  source: string;
  gameCount: number;
  games: SBRGame[];
  error?: string;
}

export default function SBROpenersTab() {
  const [games, setGames] = useState<SBRGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [lastScraped, setLastScraped] = useState<string | null>(null);

  const fetchSBROdds = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/ratings/sbr-odds?date=${selectedDate}`);
      const data: SBRResponse = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to fetch: ${res.status}`);
      }
      
      setGames(data.games || []);
      setLastScraped(data.scrapedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSBROdds();
  }, [selectedDate]);

  const formatSpread = (spread: number | null) => {
    if (spread === null || spread === undefined) return '-';
    const sign = spread > 0 ? '+' : '';
    return `${sign}${spread}`;
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header with date picker */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">SBR Opener Odds</h2>
          <p className="text-sm text-gray-500">Opening lines from SportsbookReview</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => changeDate(-1)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 font-medium"
          >
            ← Prev
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => changeDate(1)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 font-medium"
          >
            Next →
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
          >
            Today
          </button>
          <button
            onClick={() => fetchSBROdds()}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Syncing...' : '🔄 Sync'}
          </button>
        </div>
      </div>

      {/* Date display */}
      <div className="text-sm text-gray-600">
        Showing: <span className="font-medium text-gray-900">{formatDisplayDate(selectedDate)}</span>
        {lastScraped && (
          <span className="ml-4 text-gray-400">
            Scraped: {new Date(lastScraped).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-pulse text-lg">Scraping SBR odds...</div>
          <p className="text-sm mt-2">This may take a few seconds</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <strong>Error:</strong> {error}
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && games.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-3">🏀</div>
          <p>No games found for {formatDisplayDate(selectedDate)}</p>
          <p className="text-sm mt-2">Try selecting a different date</p>
        </div>
      )}

      {/* Games table */}
      {!loading && games.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Away Team
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Home Team
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Opener
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {games.map((game, idx) => (
                <tr 
                  key={`${game.awayTeam}-${game.homeTeam}-${idx}`} 
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {game.gameTime}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {game.awayTeam}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {game.homeTeam}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono">
                    <span className={
                      game.openerSpread === null ? 'text-gray-400' :
                      game.openerSpread > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                    }>
                      {formatSpread(game.openerSpread)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {game.isComplete 
                      ? <span className="font-semibold text-gray-900">{game.awayScore}-{game.homeScore}</span>
                      : <span className="text-gray-300">-</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="px-4 py-3 bg-gray-50 text-xs text-gray-500 border-t border-gray-200 flex justify-between">
            <span>Source: sportsbookreview.com</span>
            <span>{games.length} games • Opener = Home team spread</span>
          </div>
        </div>
      )}
    </div>
  );
}
