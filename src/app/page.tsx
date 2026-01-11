// src/app/page.tsx (modified with My Bets tab and Press-and-Hold Admin Access)
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchOdds, fetchFutures, Game, FuturesMarket, BOOKMAKERS, LEAGUES } from '@/lib/api';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';
import ConferenceFilter from '@/components/ConferenceFilter';
import BookmakerSelector from '@/components/BookmakerSelector';
import MyBets from '@/components/MyBets';
import { getTeamConference } from '@/lib/conferences';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  league: string;
}

// Cache time in milliseconds (e.g., 5 minutes)
const CACHE_TIME = 5 * 60 * 1000;

// Check if data is in cache and still valid - moved outside component
const isValidCache = <T,>(cache: { [league: string]: CacheItem<T> }, league: string): boolean => {
  if (!cache[league]) return false;
  const now = Date.now();
  return (now - cache[league].timestamp) < CACHE_TIME;
};

export default function Home() {
  const router = useRouter();
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  
  const [activeLeague, setActiveLeague] = useState('basketball_nba');
  const [activeView, setActiveView] = useState<'games' | 'futures' | 'mybets'>('games'); // Added 'mybets'
  const [games, setGames] = useState<Game[]>([]);
  const [futures, setFutures] = useState<FuturesMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isClient, setIsClient] = useState(false);
  const [apiRequestsRemaining, setApiRequestsRemaining] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState(''); // Team filter state
  const [selectedConferences, setSelectedConferences] = useState<string[]>([]); // Conference filter state
  const [selectedBookmakers, setSelectedBookmakers] = useState<string[]>([...BOOKMAKERS]); // Bookmaker filter state
  const [favoriteGames, setFavoriteGames] = useState<string[]>([]); // Favorite game IDs
  const [favoritesLoading, setFavoritesLoading] = useState(false); // Separate loading state for favorites
  
  // Cache state
  const [gamesCache, setGamesCache] = useState<{ [league: string]: CacheItem<Game[]> }>({});
  const [futuresCache, setFuturesCache] = useState<{ [league: string]: CacheItem<FuturesMarket[]> }>({});
  
  // Define the Masters league ID correctly
  const MASTERS_LEAGUE_ID = 'golf_masters_tournament_winner';

  // Set isClient to true when component mounts on client side
  useEffect(() => {
    setIsClient(true);
    
    // Load saved league from localStorage after client-side hydration
    const savedLeague = localStorage.getItem('activeLeague');
    if (savedLeague) {
      setActiveLeague(savedLeague);
    }
    
    // Load saved bookmaker selection from localStorage
    const savedBookmakers = localStorage.getItem('selectedBookmakers');
    if (savedBookmakers) {
      try {
        const parsed = JSON.parse(savedBookmakers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedBookmakers(parsed);
        }
      } catch (e) {
        console.error('Error parsing saved bookmakers:', e);
      }
    }
    
    // Load saved favorite games from localStorage
    const savedFavorites = localStorage.getItem('favoriteGames');
    if (savedFavorites) {
      try {
        const parsed = JSON.parse(savedFavorites);
        if (Array.isArray(parsed)) {
          setFavoriteGames(parsed);
        }
      } catch (e) {
        console.error('Error parsing saved favorites:', e);
      }
    }
  }, []);

  // Force futures view when Masters is selected
  useEffect(() => {
    if (activeLeague === MASTERS_LEAGUE_ID) {
      setActiveView('futures');
    }
    setTeamFilter(''); // Clear filter when changing leagues
    setSelectedConferences([]); // Clear conference filter when changing leagues
  }, [activeLeague]);

  // Save to localStorage when activeLeague changes, but only after hydration
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('activeLeague', activeLeague);
    }
  }, [activeLeague, isClient]);

  // Save selected bookmakers to localStorage
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('selectedBookmakers', JSON.stringify(selectedBookmakers));
    }
  }, [selectedBookmakers, isClient]);

  // Save favorite games to localStorage
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('favoriteGames', JSON.stringify(favoriteGames));
    }
  }, [favoriteGames, isClient]);

  // Toggle favorite game
  const toggleFavoriteGame = (gameId: string) => {
    setFavoriteGames(prev => 
      prev.includes(gameId) 
        ? prev.filter(id => id !== gameId)
        : [...prev, gameId]
    );
  };

  // Get all favorited games from cache
  const favoritedGamesFromCache = useMemo(() => {
    if (favoriteGames.length === 0) return [];
    
    const allCachedGames: Game[] = [];
    Object.values(gamesCache).forEach(cacheItem => {
      allCachedGames.push(...cacheItem.data);
    });
    
    // Filter to only favorites and sort chronologically (nearest game first)
    return allCachedGames
      .filter(g => favoriteGames.includes(g.id))
      .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
  }, [favoriteGames, gamesCache]);

  // Load all active leagues for favorites view
  const loadAllLeaguesForFavorites = useCallback(async () => {
    if (favoriteGames.length === 0) {
      setFavoritesLoading(false);
      return;
    }

    setFavoritesLoading(true);
    
    try {
      const now = Date.now();
      // Get all active leagues that support games (not Masters which is futures-only)
      const activeLeagueIds = LEAGUES
        .filter(l => l.isActive && l.id !== MASTERS_LEAGUE_ID)
        .map(l => l.id);
      
      // Check which leagues need to be fetched (not cached or cache expired)
      const leaguesToFetch = activeLeagueIds.filter(leagueId => !isValidCache(gamesCache, leagueId));
      
      if (leaguesToFetch.length === 0) {
        // All leagues are cached, no need to fetch
        setFavoritesLoading(false);
        return;
      }
      
      // Fetch all needed leagues in parallel
      const results = await Promise.all(
        leaguesToFetch.map(async (leagueId) => {
          try {
            const response = await fetchOdds(leagueId);
            return { 
              league: leagueId, 
              data: response.data, 
              timestamp: now,
              requestsRemaining: response.requestsRemaining
            };
          } catch (error) {
            console.error(`Error fetching ${leagueId}:`, error);
            return null;
          }
        })
      );
      
      // Update cache with results
      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (validResults.length > 0) {
        setGamesCache(prev => {
          const newCache = { ...prev };
          validResults.forEach(result => {
            newCache[result.league] = { 
              data: result.data, 
              timestamp: result.timestamp, 
              league: result.league 
            };
          });
          return newCache;
        });
        
        // Update API requests remaining with the last result
        const lastResult = validResults[validResults.length - 1];
        if (lastResult.requestsRemaining) {
          setApiRequestsRemaining(lastResult.requestsRemaining);
        }
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setFavoritesLoading(false);
    }
  }, [favoriteGames.length, gamesCache]);

  // Load favorites when switching to favorites view
  useEffect(() => {
    if (activeLeague === 'favorites' && favoriteGames.length > 0) {
      loadAllLeaguesForFavorites();
    }
  }, [activeLeague, loadAllLeaguesForFavorites, favoriteGames.length]);

  // Load data from cache or API
  const loadData = useCallback(async function() {
    // Don't load odds data when viewing My Bets
    if (activeView === 'mybets') {
      setLoading(false);
      return;
    }
    
    // For favorites view, we use a separate loading function
    if (activeLeague === 'favorites') {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    // Add a small delay to prevent rapid successive calls
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const now = Date.now();
    
    const needsGames = activeView === 'games' && activeLeague !== MASTERS_LEAGUE_ID;
    const needsFutures = activeView === 'futures' || activeLeague === MASTERS_LEAGUE_ID;
    
    try {
      let gamesLoaded = false;
      let futuresLoaded = false;
      
      // Load games if needed
      if (needsGames) {
        if (isValidCache(gamesCache, activeLeague)) {
          // Use cached data
          setGames(gamesCache[activeLeague].data);
          gamesLoaded = true;
        } else {
          // Fetch fresh data
          const response = await fetchOdds(activeLeague);
          setGames(response.data);
          setApiRequestsRemaining(response.requestsRemaining);
          setGamesCache(prev => ({
            ...prev,
            [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
          }));
          gamesLoaded = true;
        }
      }
      
      // Load futures if needed
      if (needsFutures) {
        if (isValidCache(futuresCache, activeLeague)) {
          // Use cached data
          setFutures(futuresCache[activeLeague].data);
          futuresLoaded = true;
        } else {
          // Fetch fresh data
          const response = await fetchFutures(activeLeague);
          setFutures(response.data);
          setApiRequestsRemaining(response.requestsRemaining);
          setFuturesCache(prev => ({
            ...prev,
            [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
          }));
          futuresLoaded = true;
        }
      }
      
      if (gamesLoaded || futuresLoaded) {
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeLeague, activeView, gamesCache, futuresCache]);

  // Force reload with fresh data (for refresh button)
  const forceRefresh = useCallback(async function() {
    // Don't refresh when viewing My Bets
    if (activeView === 'mybets') {
      return;
    }
    
    // For favorites, refresh all active leagues
    if (activeLeague === 'favorites') {
      if (favoriteGames.length === 0) return;
      
      setFavoritesLoading(true);
      
      try {
        const now = Date.now();
        const activeLeagueIds = LEAGUES
          .filter(l => l.isActive && l.id !== MASTERS_LEAGUE_ID)
          .map(l => l.id);
        
        // Fetch all active leagues (force refresh, ignore cache)
        const results = await Promise.all(
          activeLeagueIds.map(async (leagueId) => {
            try {
              const response = await fetchOdds(leagueId);
              return { 
                league: leagueId, 
                data: response.data, 
                timestamp: now,
                requestsRemaining: response.requestsRemaining
              };
            } catch (error) {
              console.error(`Error fetching ${leagueId}:`, error);
              return null;
            }
          })
        );
        
        // Update cache with results
        const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        if (validResults.length > 0) {
          setGamesCache(prev => {
            const newCache = { ...prev };
            validResults.forEach(result => {
              newCache[result.league] = { 
                data: result.data, 
                timestamp: result.timestamp, 
                league: result.league 
              };
            });
            return newCache;
          });
          
          const lastResult = validResults[validResults.length - 1];
          if (lastResult.requestsRemaining) {
            setApiRequestsRemaining(lastResult.requestsRemaining);
          }
          setLastUpdated(new Date());
        }
      } catch (error) {
        console.error('Error refreshing favorites:', error);
      } finally {
        setFavoritesLoading(false);
      }
      return;
    }
    
    setLoading(true);
    
    try {
      const now = Date.now();
      
      // Load based on the current view and league
      if (activeView === 'games' && activeLeague !== MASTERS_LEAGUE_ID) {
        const response = await fetchOdds(activeLeague);
        setGames(response.data);
        setApiRequestsRemaining(response.requestsRemaining);
        setGamesCache(prev => ({
          ...prev,
          [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
        }));
      } else {
        const response = await fetchFutures(activeLeague);
        setFutures(response.data);
        setApiRequestsRemaining(response.requestsRemaining);
        setFuturesCache(prev => ({
          ...prev,
          [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
        }));
      }
      
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeLeague, activeView, favoriteGames.length]);
  
  // Load data when league or view changes (but not for mybets or favorites)
  useEffect(() => {
    if (activeView !== 'mybets' && activeLeague !== 'favorites') {
      loadData();
    } else if (activeLeague === 'favorites') {
      setLoading(false);
    }
  }, [loadData, activeView, activeLeague]);

  // Force the effective view for rendering - WITH EXPLICIT TYPE ANNOTATION
  const effectiveView: 'games' | 'futures' | 'mybets' = activeLeague === MASTERS_LEAGUE_ID ? 'futures' : activeView;

  // Filter games based on team name AND conferences
  const filteredGames = useMemo(() => {
    let filtered = games;

    // Filter by team name
    if (teamFilter.trim()) {
      const searchTerm = teamFilter.toLowerCase().trim();
      filtered = filtered.filter(game => 
        game.home_team.toLowerCase().includes(searchTerm) || 
        game.away_team.toLowerCase().includes(searchTerm)
      );
    }

    // Filter by conference if any are selected
    if (selectedConferences.length > 0) {
      filtered = filtered.filter(game => {
        const homeConference = getTeamConference(activeLeague, game.home_team);
        const awayConference = getTeamConference(activeLeague, game.away_team);
        
        // Show game if either team is in a selected conference
        return (homeConference && selectedConferences.includes(homeConference)) ||
               (awayConference && selectedConferences.includes(awayConference));
      });
    }

    return filtered;
  }, [games, teamFilter, selectedConferences, activeLeague]);

  // Filter futures based on team/player name
  const filteredFutures = futures.map(market => ({
    ...market,
    teams: market.teams.filter(team => {
      if (!teamFilter.trim()) return true;
      const searchTerm = teamFilter.toLowerCase().trim();
      return team.team.toLowerCase().includes(searchTerm);
    })
  })).filter(market => market.teams.length > 0); // Only show markets with matching teams

  // Check if current sport supports conference filtering
  const supportsConferenceFilter = ['americanfootball_ncaaf', 'basketball_ncaab'].includes(activeLeague);

  return (
    <main className="min-h-screen bg-blue-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-bold text-blue-600">odds.day</h1>
            
            {/* Right side header items */}
            <div className="flex items-center gap-3">
              {/* Bookmaker Selector - only show when not in mybets view */}
              {activeView !== 'mybets' && (
                <BookmakerSelector
                  selectedBookmakers={selectedBookmakers}
                  onSelectionChange={setSelectedBookmakers}
                />
              )}
              
              {/* My Bets Tab Button with Press-and-Hold for Admin Access */}
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsHolding(true);
                  console.log('Starting hold timer...'); // Debug log
                  // Start 2-second timer for admin access
                  pressTimer.current = setTimeout(() => {
                    console.log('Timer completed! Navigating to admin...'); // Debug log
                    setIsHolding(false);
                    router.push('/admin/bets');
                  }, 2000);
                }}
                onMouseUp={() => {
                  console.log('Mouse up, clearing timer'); // Debug log
                  setIsHolding(false);
                  // If timer exists and hasn't fired yet, do normal toggle
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                    setActiveView(activeView === 'mybets' ? 'games' : 'mybets');
                  }
                }}
                onMouseLeave={() => {
                  console.log('Mouse left button, clearing timer'); // Debug log
                  setIsHolding(false);
                  // Cancel timer if mouse leaves button
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setIsHolding(true);
                  console.log('Touch start, starting timer...'); // Debug log
                  // Start 2-second timer for admin access (mobile)
                  pressTimer.current = setTimeout(() => {
                    console.log('Touch timer completed! Navigating to admin...'); // Debug log
                    setIsHolding(false);
                    router.push('/admin/bets');
                  }, 2000);
                }}
                onTouchEnd={() => {
                  console.log('Touch end, clearing timer'); // Debug log
                  setIsHolding(false);
                  // If timer exists and hasn't fired yet, do normal toggle (mobile)
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                    setActiveView(activeView === 'mybets' ? 'games' : 'mybets');
                  }
                }}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all select-none border border-gray-200 shadow-sm ${
  activeView === 'mybets'
    ? 'bg-blue-600 text-white'
    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
} ${isHolding ? 'scale-95 ring-2 ring-blue-400' : ''}`}
                style={{ userSelect: 'none' }}
              >
                📊 Bets {isHolding && '...'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Show different navigation based on view */}
        {activeView === 'mybets' ? (
          // Simple back button when viewing My Bets
          <div className="mb-6">
            <button
              onClick={() => setActiveView('games')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Odds
            </button>
          </div>
        ) : (
          <>
            {/* League Navigation */}
            <LeagueNav 
              activeLeague={activeLeague} 
              setActiveLeague={setActiveLeague} 
              onRefresh={forceRefresh}
              lastUpdated={lastUpdated}
              apiRequestsRemaining={apiRequestsRemaining}
              favoritesCount={favoriteGames.length}
            />

            {/* UPDATED: Team filter and Conference filter - shown for Games view (but not favorites) */}
            {effectiveView === 'games' && activeLeague !== 'favorites' && (
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Team filter */}
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Filter by team name..."
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        className="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                      {teamFilter && (
                        <button
                          onClick={() => setTeamFilter('')}
                          className="absolute inset-y-0 right-0 flex items-center pr-3"
                        >
                          <svg
                            className="w-5 h-5 text-gray-400 hover:text-gray-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  

                </div>
                
                {/* Conference Filter - only show for supported sports */}
                {supportsConferenceFilter && (
                  <ConferenceFilter
                    activeLeague={activeLeague}
                    selectedConferences={selectedConferences}
                    onConferencesChange={setSelectedConferences}
                  />
                )}
                
                {/* Active Filters Display */}
                {(teamFilter || selectedConferences.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {teamFilter && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                        Team: {teamFilter}
                        <button
                          onClick={() => setTeamFilter('')}
                          className="ml-2 hover:text-blue-600"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {selectedConferences.map(conf => (
                      <span key={conf} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                        {conf}
                        <button
                          onClick={() => setSelectedConferences(selectedConferences.filter(c => c !== conf))}
                          className="ml-2 hover:text-green-600"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      onClick={() => {
                        setTeamFilter('');
                        setSelectedConferences([]);
                      }}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}

                {/* Results count */}
                {(teamFilter || selectedConferences.length > 0) && (
                  <p className="text-sm text-gray-600">
                    Showing {filteredGames.length} of {games.length} games
                  </p>
                )}
              </div>
            )}

            {/* Team filter for Futures view */}
            {effectiveView === 'futures' && (
              <div className="mb-6">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter by team/player name..."
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  {teamFilter && (
                    <button
                      onClick={() => setTeamFilter('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3"
                    >
                      <svg
                        className="w-5 h-5 text-gray-400 hover:text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {teamFilter && (
                  <p className="mt-2 text-sm text-gray-600">
                    Showing {filteredFutures.reduce((acc, m) => acc + m.teams.length, 0)} of {futures.reduce((acc, m) => acc + m.teams.length, 0)} entries
                  </p>
                )}
              </div>
            )}

            {/* Toggle between Games and Futures - Custom version for Masters */}
            {activeLeague !== 'favorites' && (
              activeLeague === MASTERS_LEAGUE_ID ? (
                // Masters only shows Futures tab
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button
                      type="button"
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white border border-gray-200"
                    >
                      Futures
                    </button>
                  </div>
                </div>
              ) : (
                // Other leagues show both tabs
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                        activeView === 'games'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      } border border-gray-200`}
                      onClick={() => {
                        setActiveView('games');
                        setTeamFilter(''); // Clear filter when switching views
                        setSelectedConferences([]); // Clear conference filter when switching views
                      }}
                    >
                      Games
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                        activeView === 'futures'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      } border border-gray-200 border-l-0`}
                      onClick={() => {
                        setActiveView('futures');
                        setTeamFilter(''); // Clear filter when switching views
                        setSelectedConferences([]); // Clear conference filter when switching views
                      }}
                    >
                      Futures
                    </button>
                  </div>
                </div>
              )
            )}
            
            {/* Deep link tip - only show for games view */}
            {activeView === 'games' && activeLeague !== 'favorites' && (
              <p className="text-xs text-gray-500 text-center mb-4 flex items-center justify-center gap-1">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Tip: Click FanDuel, DraftKings, or Caesars odds to directly create betslip
              </p>
            )}
          </>
        )}

        {/* Main Content */}
        {activeView === 'mybets' ? (
          // My Bets View
          <MyBets />
        ) : loading || (activeLeague === 'favorites' && favoritesLoading) ? (
          // Loading State
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          // Games or Futures Content
          <div>
            {activeLeague === 'favorites' ? (
              // Favorites View
              <div>
                {favoriteGames.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="text-4xl mb-4">⭐</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No favorites yet</h3>
                    <p className="text-gray-500">
                      Tap the ☆ star next to any game to add it to your favorites.
                    </p>
                  </div>
                ) : favoritedGamesFromCache.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="text-4xl mb-4">📭</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No active favorites</h3>
                    <p className="text-gray-500 mb-4">
                      Your favorited games may have ended or are no longer available.
                    </p>
                    <p className="text-xs text-gray-400">
                      You have {favoriteGames.length} game(s) saved
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600 mb-4">
                      Showing {favoritedGamesFromCache.length} favorited game{favoritedGamesFromCache.length !== 1 ? 's' : ''}
                    </p>
                    {favoritedGamesFromCache.map(game => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        selectedBookmakers={selectedBookmakers}
                        isFavorite={true}
                        onToggleFavorite={toggleFavoriteGame}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : effectiveView === 'games' ? (
              <div>
                {filteredGames.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    {teamFilter || selectedConferences.length > 0 
                      ? 'No games match your filters.' 
                      : 'No games available for this league right now.'}
                  </div>
                ) : (
                  <div>
                    {filteredGames.map(game => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        selectedBookmakers={selectedBookmakers}
                        isFavorite={favoriteGames.includes(game.id)}
                        onToggleFavorite={toggleFavoriteGame}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {filteredFutures.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    {teamFilter ? `No results found matching "${teamFilter}".` : 'No futures available for this league right now.'}
                  </div>
                ) : (
                  <div>
                    {/* Banner for Masters on mobile */}
                    {activeLeague === MASTERS_LEAGUE_ID && (
                      <div className="sm:hidden bg-blue-50 p-2 text-center border-b border-blue-100 mb-4">
                        <p className="text-xs text-blue-800 font-medium">
                          ↔️ Rotate phone horizontally to see golfer names
                        </p>
                      </div>
                    )}
                    {filteredFutures.map((market, index) => (
                      <FuturesTable 
                        key={index} 
                        market={market} 
                        compactMode={true}
                        isMasters={activeLeague === MASTERS_LEAGUE_ID && false} // Force false to prevent name changes
                        selectedBookmakers={selectedBookmakers}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}