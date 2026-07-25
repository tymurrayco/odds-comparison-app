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

// "just now" / "2m ago" / "1h ago" — recomputed on a timer so it stays honest.
function useRelativeTime(date: Date): string {
  const [text, setText] = useState('');

  useEffect(() => {
    const compute = () => {
      const mins = Math.floor((Date.now() - date.getTime()) / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    };
    setText(compute());
    const id = setInterval(() => setText(compute()), 30000);
    return () => clearInterval(id);
  }, [date]);

  return text;
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
  const relative = useRelativeTime(lastUpdated);
  // Quota is developer instrumentation — only surfaced with ?admin=true
  const [showQuota, setShowQuota] = useState(false);

  useEffect(() => {
    setTimeString(lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [lastUpdated]);

  useEffect(() => {
    setShowQuota(new URLSearchParams(window.location.search).get('admin') === 'true');
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const formattedRequests = apiRequestsRemaining
    ? Math.round(parseFloat(apiRequestsRemaining)).toLocaleString()
    : null;

  const pillBase =
    'flex-none scroll-ml-2 snap-start px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';

  return (
    // Sticky: switching leagues never requires scrolling back to the top
    <div className="sticky top-0 z-30 -mx-4 px-4 sm:mx-0 sm:px-0 mb-4">
      <div className="bg-white/95 backdrop-blur rounded-lg shadow-sm px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          {/* Horizontally scrolling league strip with a fade at the right edge */}
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-2 overflow-x-auto snap-x snap-proximity scrollbar-none pb-0.5">
              <button
                className={`${pillBase} ${
                  activeLeague === 'favorites'
                    ? 'bg-yellow-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                onClick={() => setActiveLeague('favorites')}
                aria-label="Favorites"
              >
                ★{favoritesCount > 0 && <span className="ml-1 text-xs opacity-75">{favoritesCount}</span>}
              </button>

              <span className="flex-none w-px my-1 bg-gray-200" aria-hidden="true" />

              {LEAGUES.filter(league => league.isActive).map(league => (
                <button
                  key={league.id}
                  className={`${pillBase} ${
                    activeLeague === league.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => setActiveLeague(league.id)}
                >
                  {league.name}
                </button>
              ))}
            </div>
            {/* edge fade cue that more leagues exist */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-white to-transparent" />
          </div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex-none inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              isRefreshing ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}
            aria-label="Refresh odds"
            title="Refresh odds"
          >
            <svg
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
            >
              <path d="M21 12a9 9 0 1 1-2.6-6.4" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {/* Quiet timestamp line: relative + absolute */}
        <div className="mt-1 text-[11px] text-gray-400 flex items-center gap-2">
          <span>
            {isRefreshing ? 'Updating…' : `Updated ${relative}`}
            {timeString && !isRefreshing && ` · ${timeString}`}
          </span>
          {showQuota && formattedRequests && (
            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
              {formattedRequests} left
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
