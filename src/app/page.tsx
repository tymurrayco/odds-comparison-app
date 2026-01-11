// src/app/page.tsx
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  fetchOdds, 
  fetchFutures, 
  fetchPropsEvents, 
  fetchProps,
  fetchESPNScores,
  matchGameToScore,
  Game, 
  FuturesMarket, 
  PropsEvent, 
  ProcessedPropsMarket,
  ESPNGameScore,
  BOOKMAKERS, 
  LEAGUES,
  PROPS_SUPPORTED_LEAGUES 
} from '@/lib/api';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';
import PropsTable from '@/components/PropsTable';
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

// Wrapper component to handle Suspense for useSearchParams
function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  
  const [activeLeague, setActiveLeague] = useState('basketball_nba');
  const [activeView, setActiveView] = useState<'games' | 'futures' | 'props' | 'mybets'>('games');
  const [games, setGames] = useState<Game[]>([]);
  const [futures, setFutures] = useState<FuturesMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isClient, setIsClient] = useState(false);
  const [apiRequestsRemaining, setApiRequestsRemaining] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState('');
  const [selectedConferences, setSelectedConferences] = useState<string[]>([]);
  const [selectedBookmakers, setSelectedBookmakers] = useState<string[]>([...BOOKMAKERS]);
  const [favoriteGames, setFavoriteGames] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [highlightedGameId, setHighlightedGameId] = useState<string | null>(null);
  
  // Props state
  const [propsEvents, setPropsEvents] = useState<PropsEvent[]>([]);
  const [selectedPropsEvent, setSelectedPropsEvent] = useState<PropsEvent | null>(null);
  const [propsData, setPropsData] = useState<ProcessedPropsMarket[]>([]);
  const [propsLoading, setPropsLoading] = useState(false);
  const [playerFilter, setPlayerFilter] = useState('');
  
  // ESPN live scores state
  const [espnScores, setEspnScores] = useState<ESPNGameScore[]>([]);
  
  // Cache state
  const [gamesCache, setGamesCache] = useState<{ [league: string]: CacheItem<Game[]> }>({});
  const [futuresCache, setFuturesCache] = useState<{ [league: string]: CacheItem<FuturesMarket[]> }>({});
  const [propsEventsCache, setPropsEventsCache] = useState<{ [league: string]: CacheItem<PropsEvent[]> }>({});
  
  // Define the Masters league ID correctly
  const MASTERS_LEAGUE_ID = 'golf_masters_tournament_winner';

  // Check if current league supports props
  const supportsProps = PROPS_SUPPORTED_LEAGUES.includes(activeLeague);

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

  // Handle URL params for shared game links
  useEffect(() => {
    const gameId = searchParams.get('game');
    const leagueId = searchParams.get('league');
    
    if (gameId && leagueId) {
      // Set the league from URL
      setActiveLeague(leagueId);
      setActiveView('games');
      setHighlightedGameId(gameId);
    }
  }, [searchParams]);

  // Scroll to highlighted game once games are loaded
  useEffect(() => {
    if (highlightedGameId && !loading && games.length > 0) {
      // Small delay to ensure DOM is rendered
      setTimeout(() => {
        const element = document.getElementById(`game-${highlightedGameId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Clear highlight after 3 seconds
        setTimeout(() => {
          setHighlightedGameId(null);
          // Clear URL params without refresh
          router.replace('/', { scroll: false });
        }, 3000);
      }, 100);
    }
  }, [highlightedGameId, loading, games, router]);

  // Force futures view when Masters is selected, reset props when league changes
  useEffect(() => {
    if (activeLeague === MASTERS_LEAGUE_ID) {
      setActiveView('futures');
    }
    // If switching to a league that doesn't support props while on props view, switch to games
    if (activeView === 'props' && !PROPS_SUPPORTED_LEAGUES.includes(activeLeague)) {
      setActiveView('games');
    }
    setTeamFilter('');
    setSelectedConferences([]);
    setSelectedPropsEvent(null);
    setPropsData([]);
    setPlayerFilter('');
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

  // Refresh ESPN scores every 30 seconds when viewing games with live games
  useEffect(() => {
    if (activeView !== 'games' || activeLeague === 'favorites') return;
    
    // Check if there are any live games
    const hasLiveGames = games.some(game => {
      const gameTime = new Date(game.commence_time).getTime();
      return gameTime <= Date.now();
    });
    
    if (!hasLiveGames) return;
    
    const interval = setInterval(async () => {
      try {
        const scores = await fetchESPNScores(activeLeague);
        setEspnScores(scores);
      } catch (error) {
        console.error('Error refreshing ESPN scores:', error);
      }
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [activeView, activeLeague, games]);

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
      const activeLeagueIds = LEAGUES
        .filter(l => l.isActive && l.id !== MASTERS_LEAGUE_ID)
        .map(l => l.id);
      
      const leaguesToFetch = activeLeagueIds.filter(leagueId => !isValidCache(gamesCache, leagueId));
      
      if (leaguesToFetch.length === 0) {
        setFavoritesLoading(false);
        return;
      }
      
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

  // Load props events when switching to props view
  const loadPropsEvents = useCallback(async () => {
    if (!supportsProps) return;
    
    const now = Date.now();
    
    // Check cache first
    if (isValidCache(propsEventsCache, activeLeague)) {
      setPropsEvents(propsEventsCache[activeLeague].data);
      return;
    }
    
    setPropsLoading(true);
    try {
      const response = await fetchPropsEvents(activeLeague);
      setPropsEvents(response.data);
      setApiRequestsRemaining(response.requestsRemaining);
      setPropsEventsCache(prev => ({
        ...prev,
        [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
      }));
    } catch (error) {
      console.error('Error loading props events:', error);
    } finally {
      setPropsLoading(false);
    }
  }, [activeLeague, supportsProps, propsEventsCache]);

  // Load props for selected event
  const loadPropsForEvent = useCallback(async (event: PropsEvent) => {
    setPropsLoading(true);
    setSelectedPropsEvent(event);
    setPropsData([]);
    
    try {
      const response = await fetchProps(activeLeague, event.id);
      setPropsData(response.data);
      setApiRequestsRemaining(response.requestsRemaining);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading props:', error);
    } finally {
      setPropsLoading(false);
    }
  }, [activeLeague]);

  // Load data from cache or API
  const loadData = useCallback(async function() {
    if (activeView === 'mybets') {
      setLoading(false);
      return;
    }
    
    if (activeLeague === 'favorites') {
      setLoading(false);
      return;
    }
    
    // For props view, load events list
    if (activeView === 'props') {
      await loadPropsEvents();
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const now = Date.now();
    
    const needsGames = activeView === 'games' && activeLeague !== MASTERS_LEAGUE_ID;
    const needsFutures = activeView === 'futures' || activeLeague === MASTERS_LEAGUE_ID;
    
    try {
      let gamesLoaded = false;
      let futuresLoaded = false;
      
      if (needsGames) {
        if (isValidCache(gamesCache, activeLeague)) {
          setGames(gamesCache[activeLeague].data);
          gamesLoaded = true;
        } else {
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
      
      if (needsFutures) {
        if (isValidCache(futuresCache, activeLeague)) {
          setFutures(futuresCache[activeLeague].data);
          futuresLoaded = true;
        } else {
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
      
      // Fetch ESPN scores for live games (only for games view)
      if (needsGames) {
        try {
          const scores = await fetchESPNScores(activeLeague);
          setEspnScores(scores);
        } catch (error) {
          console.error('Error fetching ESPN scores:', error);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeLeague, activeView, gamesCache, futuresCache, loadPropsEvents]);

  // Force refresh (bypass cache)
  const forceRefresh = useCallback(async function() {
    if (activeLeague === 'favorites') {
      setFavoritesLoading(true);
      try {
        const now = Date.now();
        const activeLeagueIds = LEAGUES
          .filter(l => l.isActive && l.id !== MASTERS_LEAGUE_ID)
          .map(l => l.id);
        
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
    
    // Force refresh props
    if (activeView === 'props') {
      setPropsLoading(true);
      try {
        const now = Date.now();
        const response = await fetchPropsEvents(activeLeague);
        setPropsEvents(response.data);
        setApiRequestsRemaining(response.requestsRemaining);
        setPropsEventsCache(prev => ({
          ...prev,
          [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
        }));
        
        // If an event was selected, refresh its props too
        if (selectedPropsEvent) {
          const propsResponse = await fetchProps(activeLeague, selectedPropsEvent.id);
          setPropsData(propsResponse.data);
        }
        
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Error refreshing props:', error);
      } finally {
        setPropsLoading(false);
      }
      return;
    }
    
    setLoading(true);
    
    try {
      const now = Date.now();
      
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
  }, [activeLeague, activeView, selectedPropsEvent]);
  
  // Load data when league or view changes
  useEffect(() => {
    if (activeView !== 'mybets' && activeLeague !== 'favorites') {
      loadData();
    } else if (activeLeague === 'favorites') {
      setLoading(false);
    }
  }, [loadData, activeView, activeLeague]);

  // Force the effective view for rendering
  const effectiveView: 'games' | 'futures' | 'props' | 'mybets' = activeLeague === MASTERS_LEAGUE_ID ? 'futures' : activeView;

  // Filter games based on team name AND conferences
  const filteredGames = useMemo(() => {
    let filtered = games;

    if (teamFilter.trim()) {
      const searchTerm = teamFilter.toLowerCase().trim();
      filtered = filtered.filter(game => 
        game.home_team.toLowerCase().includes(searchTerm) || 
        game.away_team.toLowerCase().includes(searchTerm)
      );
    }

    if (selectedConferences.length > 0) {
      filtered = filtered.filter(game => {
        const homeConference = getTeamConference(activeLeague, game.home_team);
        const awayConference = getTeamConference(activeLeague, game.away_team);
        
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
  })).filter(market => market.teams.length > 0);

  // Filter props events based on team name
  const filteredPropsEvents = useMemo(() => {
    if (!teamFilter.trim()) return propsEvents;
    const searchTerm = teamFilter.toLowerCase().trim();
    return propsEvents.filter(event => 
      event.home_team.toLowerCase().includes(searchTerm) || 
      event.away_team.toLowerCase().includes(searchTerm)
    );
  }, [propsEvents, teamFilter]);

  // Check if current sport supports conference filtering
  const supportsConferenceFilter = ['americanfootball_ncaaf', 'basketball_ncaab'].includes(activeLeague);

  // Format date/time for props events
  const formatEventTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <main className="min-h-screen bg-blue-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <h1 className="text-xl font-bold text-blue-600">odds.day</h1>
            
            <div className="flex items-center gap-3">
              {activeView !== 'mybets' && (
                <BookmakerSelector
                  selectedBookmakers={selectedBookmakers}
                  onSelectionChange={setSelectedBookmakers}
                />
              )}
              
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsHolding(true);
                  pressTimer.current = setTimeout(() => {
                    setIsHolding(false);
                    router.push('/admin/bets');
                  }, 2000);
                }}
                onMouseUp={() => {
                  setIsHolding(false);
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                    setActiveView(activeView === 'mybets' ? 'games' : 'mybets');
                  }
                }}
                onMouseLeave={() => {
                  setIsHolding(false);
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setIsHolding(true);
                  pressTimer.current = setTimeout(() => {
                    setIsHolding(false);
                    router.push('/admin/bets');
                  }, 2000);
                }}
                onTouchEnd={() => {
                  setIsHolding(false);
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
        {activeView === 'mybets' ? (
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
            <LeagueNav 
              activeLeague={activeLeague} 
              setActiveLeague={setActiveLeague} 
              onRefresh={forceRefresh}
              lastUpdated={lastUpdated}
              apiRequestsRemaining={apiRequestsRemaining}
              favoritesCount={favoritedGamesFromCache.length}
            />

            {/* Team filter for Games view */}
            {effectiveView === 'games' && activeLeague !== 'favorites' && (
              <div className="mb-6 space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
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
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {teamFilter && (
                        <button
                          onClick={() => setTeamFilter('')}
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {supportsConferenceFilter && (
                    <ConferenceFilter
                      activeLeague={activeLeague}
                      selectedConferences={selectedConferences}
                      onConferencesChange={setSelectedConferences}
                    />
                  )}
                </div>

                {(teamFilter || selectedConferences.length > 0) && (
                  <div className="flex flex-wrap gap-2 items-center">
                    {teamFilter && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                        Team: {teamFilter}
                        <button onClick={() => setTeamFilter('')} className="ml-2 hover:text-blue-600">×</button>
                      </span>
                    )}
                    {selectedConferences.map(conf => (
                      <span key={conf} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                        {conf}
                        <button onClick={() => setSelectedConferences(selectedConferences.filter(c => c !== conf))} className="ml-2 hover:text-green-600">×</button>
                      </span>
                    ))}
                    <button onClick={() => { setTeamFilter(''); setSelectedConferences([]); }} className="text-sm text-gray-600 hover:text-gray-800">
                      Clear all filters
                    </button>
                  </div>
                )}

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
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {teamFilter && (
                    <button
                      onClick={() => setTeamFilter('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Props view filters */}
            {effectiveView === 'props' && (
              <div className="mb-6 space-y-4">
                {/* Game filter (when no event selected) or Player filter (when event selected) */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder={selectedPropsEvent ? "Filter by player name..." : "Filter by team name..."}
                    value={selectedPropsEvent ? playerFilter : teamFilter}
                    onChange={(e) => selectedPropsEvent ? setPlayerFilter(e.target.value) : setTeamFilter(e.target.value)}
                    className="w-full px-4 py-2 pl-10 pr-4 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  {(selectedPropsEvent ? playerFilter : teamFilter) && (
                    <button
                      onClick={() => selectedPropsEvent ? setPlayerFilter('') : setTeamFilter('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* View Toggle Tabs - Only show when not in favorites */}
            {activeLeague !== 'favorites' && (
              activeLeague === MASTERS_LEAGUE_ID ? (
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button type="button" className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white border border-gray-200">
                      Futures
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                        activeView === 'games' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                      } border border-gray-200`}
                      onClick={() => {
                        setActiveView('games');
                        setTeamFilter('');
                        setSelectedConferences([]);
                        setSelectedPropsEvent(null);
                        setPlayerFilter('');
                      }}
                    >
                      Games
                    </button>
                    <button
                      type="button"
                      className={`px-4 py-2 text-sm font-medium ${
                        activeView === 'futures' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                      } border border-gray-200 border-l-0`}
                      onClick={() => {
                        setActiveView('futures');
                        setTeamFilter('');
                        setSelectedConferences([]);
                        setSelectedPropsEvent(null);
                        setPlayerFilter('');
                      }}
                    >
                      Futures
                    </button>
                    {supportsProps && (
                      <button
                        type="button"
                        className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                          activeView === 'props' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                        } border border-gray-200 border-l-0`}
                        onClick={() => {
                          setActiveView('props');
                          setTeamFilter('');
                          setSelectedConferences([]);
                          setPlayerFilter('');
                        }}
                      >
                        Props
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
            
            {/* Deep link tip - only show for games view */}
            {activeView === 'games' && activeLeague !== 'favorites' && (
              <>
                {/* Mobile: shorter message */}
                <p className="md:hidden text-xs text-gray-500 text-center mb-4 flex items-center justify-center gap-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Tap odds to open in sportsbook app
                </p>
                {/* Desktop: full message */}
                <p className="hidden md:flex text-xs text-gray-500 text-center mb-4 items-center justify-center gap-1">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Click FanDuel, DraftKings, or Caesars odds to directly create betslip
                </p>
              </>
            )}
          </>
        )}

        {/* Main Content */}
        {activeView === 'mybets' ? (
          <MyBets />
        ) : loading || (activeLeague === 'favorites' && favoritesLoading) ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div>
            {activeLeague === 'favorites' ? (
              <div>
                {favoriteGames.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="text-4xl mb-4">⭐</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No favorites yet</h3>
                    <p className="text-gray-500">Tap the ☆ star next to any game to add it to your favorites.</p>
                  </div>
                ) : favoritedGamesFromCache.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-6 text-center">
                    <div className="text-4xl mb-4">📭</div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No active favorites</h3>
                    <p className="text-gray-500 mb-4">Your favorited games may have ended or are no longer available.</p>
                    <p className="text-xs text-gray-400">You have {favoriteGames.length} game(s) saved</p>
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
                        liveScore={matchGameToScore(game, espnScores)}
                        highlightedGameId={highlightedGameId}
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
                        liveScore={matchGameToScore(game, espnScores)}
                        highlightedGameId={highlightedGameId}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : effectiveView === 'props' ? (
              <div>
                {propsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : selectedPropsEvent ? (
                  // Show props for selected game
                  <div>
                    {/* Clickable game header - click to collapse/go back to game list */}
                    <div 
                      className="bg-white rounded-lg shadow p-4 mb-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        setSelectedPropsEvent(null);
                        setPropsData([]);
                        setPlayerFilter('');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        {/* Mobile: logos only */}
                        <div className="flex md:hidden items-center gap-2">
                          <img 
                            src={`/team-logos/${selectedPropsEvent.away_team.toLowerCase().replace(/\s+/g, '')}.png`}
                            alt={selectedPropsEvent.away_team}
                            className="h-8 w-8"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <span className="text-gray-400">@</span>
                          <img 
                            src={`/team-logos/${selectedPropsEvent.home_team.toLowerCase().replace(/\s+/g, '')}.png`}
                            alt={selectedPropsEvent.home_team}
                            className="h-8 w-8"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                        {/* Desktop: logos + names */}
                        <div className="hidden md:flex items-center gap-3">
                          <img 
                            src={`/team-logos/${selectedPropsEvent.away_team.toLowerCase().replace(/\s+/g, '')}.png`}
                            alt=""
                            className="h-8 w-8"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <span className="font-medium">{selectedPropsEvent.away_team}</span>
                          <span className="text-gray-400">@</span>
                          <span className="font-medium">{selectedPropsEvent.home_team}</span>
                          <img 
                            src={`/team-logos/${selectedPropsEvent.home_team.toLowerCase().replace(/\s+/g, '')}.png`}
                            alt=""
                            className="h-8 w-8"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs md:text-sm text-gray-500">{formatEventTime(selectedPropsEvent.commence_time)}</span>
                          <svg 
                            className="w-5 h-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <PropsTable 
                      markets={propsData} 
                      selectedBookmakers={selectedBookmakers}
                      playerFilter={playerFilter}
                    />
                  </div>
                ) : (
                  // Show game selector
                  <div>
                    {filteredPropsEvents.length === 0 ? (
                      <div className="bg-white rounded-lg shadow p-6 text-center">
                        {teamFilter 
                          ? `No games found matching "${teamFilter}".`
                          : 'No games available for player props right now.'}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-600 mb-4">
                          Select a game to view player props ({filteredPropsEvents.length} game{filteredPropsEvents.length !== 1 ? 's' : ''} available)
                        </p>
                        {filteredPropsEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={() => loadPropsForEvent(event)}
                            className="w-full bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow text-left"
                          >
                            <div className="flex items-center justify-between">
                              {/* Mobile: logos only */}
                              <div className="flex md:hidden items-center gap-2">
                                <img 
                                  src={`/team-logos/${event.away_team.toLowerCase().replace(/\s+/g, '')}.png`}
                                  alt={event.away_team}
                                  className="h-8 w-8"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <span className="text-gray-400">@</span>
                                <img 
                                  src={`/team-logos/${event.home_team.toLowerCase().replace(/\s+/g, '')}.png`}
                                  alt={event.home_team}
                                  className="h-8 w-8"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                              {/* Desktop: logos + names */}
                              <div className="hidden md:flex items-center gap-3">
                                <img 
                                  src={`/team-logos/${event.away_team.toLowerCase().replace(/\s+/g, '')}.png`}
                                  alt=""
                                  className="h-8 w-8"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                                <span className="font-medium">{event.away_team}</span>
                                <span className="text-gray-400">@</span>
                                <span className="font-medium">{event.home_team}</span>
                                <img 
                                  src={`/team-logos/${event.home_team.toLowerCase().replace(/\s+/g, '')}.png`}
                                  alt=""
                                  className="h-8 w-8"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs md:text-sm text-gray-500">{formatEventTime(event.commence_time)}</span>
                                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
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
                    {filteredFutures.map(market => (
                      <FuturesTable 
                        key={market.id} 
                        market={market} 
                        compactMode={false}
                        isMasters={activeLeague === MASTERS_LEAGUE_ID}
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

// Main export with Suspense wrapper for useSearchParams
export default function Home() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-100">
        <div className="flex justify-center items-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}