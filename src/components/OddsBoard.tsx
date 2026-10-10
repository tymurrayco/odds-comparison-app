// src/components/OddsBoard.tsx
//
// The interactive odds board (was src/app/page.tsx). Rendered by / with no
// props, and by the server-rendered sport pages (/nfl, /nba, ...) with
// `initialLeague` + `initialGames`, in which case the first render — on the
// server too — already shows every card and the client treats the given
// games as a fresh cache entry instead of refetching.
'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { slugForSportKey } from '@/lib/sportSlugs';
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
import { fetchNHLRestData, matchGameToRestData, GameRestData } from '@/lib/nhlRest';
import LeagueNav from '@/components/LeagueNav';
import GameCard from '@/components/GameCard';
import FuturesTable from '@/components/FuturesTable';
import { BoardLoading, OddsLoader } from '@/components/Loading';
import PropsTable from '@/components/PropsTable';
import ConferenceFilter from '@/components/ConferenceFilter';
import BookmakerSelector from '@/components/BookmakerSelector';
import MyBets, { BetYearFilter } from '@/components/MyBets';
import AccountButton from '@/components/AccountButton';
import dynamic from 'next/dynamic';
import { signInWithGoogle, useUser } from '@/lib/userAuth';
import { usePrefs, zoneOption } from '@/lib/prefs';
import { hasTappedPrice, PRICE_TAPPED_EVENT } from '@/lib/betLinks';
import { favoritesWhenSignedOut, saveFavorite, syncFavorites } from '@/lib/favorites';
import { getTeamConference } from '@/lib/conferences';
import { teamMatchesSearch } from '@/lib/teamNames';
import { useTeamColorMap, teamInfoFromMap } from '@/lib/myGameBets';

interface CacheItem<T> {
  data: T;
  timestamp: number;
  league: string;
}

// Cache time in milliseconds (e.g., 5 minutes)
// Ledger ratings load in the page for this league's "Ratings" tab. The views
// are large, so they are fetched only when that tab is opened.
const RATINGS_LEAGUE = 'americanfootball_ncaaf';
const loadFbsRatingsView = () => import('@/components/FbsRatingsView');
const loadFcsRatingsView = () => import('@/components/FcsRatingsView');
// Stand-in while a view's code arrives: tall enough that the page (and the
// footer under it) doesn't jump.
const RatingsViewLoading = () => <div className="min-h-[70vh]"><OddsLoader label="Loading ratings" /></div>;
const FbsRatingsView = dynamic(loadFbsRatingsView, { loading: RatingsViewLoading });
const FcsRatingsView = dynamic(loadFcsRatingsView, { loading: RatingsViewLoading });

const CACHE_TIME = 5 * 60 * 1000;

// Check if data is in cache and still valid - moved outside component
const isValidCache = <T,>(cache: { [league: string]: CacheItem<T> }, league: string): boolean => {
  if (!cache[league]) return false;
  const now = Date.now();
  return (now - cache[league].timestamp) < CACHE_TIME;
};

export interface OddsBoardProps {
  /** Odds API sport key the page is for (/nfl → americanfootball_nfl). Wins over localStorage. */
  initialLeague?: string;
  /** Server-fetched games for initialLeague — rendered on the first pass and seeded into the cache. */
  initialGames?: Game[];
  /** When initialGames were fetched (ms); seeds the cache timestamp. */
  initialFetchedAt?: number;
}

function HomeContent({ initialLeague, initialGames, initialFetchedAt }: OddsBoardProps) {
  const router = useRouter();
  const { user, ready: authReady } = useUser();
  const prefs = usePrefs();
  // The "tap odds to …" line teaches one thing once: shown only on a device
  // that has never tapped a price (decided after mount — the server can't know).
  const [showTapHint, setShowTapHint] = useState(false);
  useEffect(() => {
    if (hasTappedPrice()) return;
    setShowTapHint(true);
    const done = () => setShowTapHint(false);
    window.addEventListener(PRICE_TAPPED_EVENT, done);
    return () => window.removeEventListener(PRICE_TAPPED_EVENT, done);
  }, []);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const crossNavSearchRef = useRef(false);

  const [activeLeague, setActiveLeague] = useState(initialLeague ?? 'basketball_nba');
  const [activeView, setActiveView] = useState<'games' | 'futures' | 'props' | 'ratings' | 'mybets'>('games');
  // NCAAF Ratings view: which division's Ledger ratings are showing
  const [ratingsDivision, setRatingsDivision] = useState<'fbs' | 'fcs'>('fbs');
  // Fetch the Ratings views' code and their ratings shortly after NCAAF
  // opens, so the tab opens straight onto the table.
  useEffect(() => {
    if (activeLeague !== RATINGS_LEAGUE) return;
    const t = setTimeout(() => {
      loadFbsRatingsView().then((m) => m.preloadRatings()).catch(() => {});
      loadFcsRatingsView().then((m) => m.preloadRatings()).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [activeLeague]);
  // My Bets year filter (header dropdown next to "Back to Odds"); years come from the loaded bets
  const [betYear, setBetYear] = useState<BetYearFilter>(new Date().getFullYear());
  const [betYears, setBetYears] = useState<number[]>([]);
  const [games, setGames] = useState<Game[]>(initialGames ?? []);
  const [futures, setFutures] = useState<FuturesMarket[]>([]);
  // Server-provided games render immediately — no spinner on the first paint
  const [loading, setLoading] = useState(!(initialLeague && initialGames));
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isClient, setIsClient] = useState(false);
  const [apiRequestsRemaining, setApiRequestsRemaining] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState('');
  // ESPN team list for the league, so search also finds short names and
  // abbreviations ("JMU", "Sac St")
  const searchTeamMap = useTeamColorMap(activeLeague);
  const teamMatches = useCallback(
    (team: string, search: string) => teamMatchesSearch(team, search, teamInfoFromMap(searchTeamMap, team)),
    [searchTeamMap]
  );
  // Games view: the search bar hides behind an icon until opened (or while a filter is typed)
  const [searchOpen, setSearchOpen] = useState(false);
  const searchShown = searchOpen || !!teamFilter;
  const closeSearch = () => {
    setTeamFilter('');
    setSearchOpen(false);
  };
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
  
  // NHL rest data state
  const [nhlRestData, setNhlRestData] = useState<GameRestData[]>([]);
  
  // Cache state (seeded with the server's games so the mount-time load is a
  // cache hit, not a second paid fetch)
  const [gamesCache, setGamesCache] = useState<{ [league: string]: CacheItem<Game[]> }>(() =>
    initialLeague && initialGames
      ? { [initialLeague]: { data: initialGames, timestamp: initialFetchedAt ?? Date.now(), league: initialLeague } }
      : {}
  );
  const [futuresCache, setFuturesCache] = useState<{ [league: string]: CacheItem<FuturesMarket[]> }>({});
  const [propsEventsCache, setPropsEventsCache] = useState<{ [league: string]: CacheItem<PropsEvent[]> }>({});
  
  // Define the Masters league ID correctly
  const MASTERS_LEAGUE_ID = 'golf_masters_tournament_winner';
  // Golf tournaments are futures-only — they have no game-odds view
  const FUTURES_ONLY_LEAGUES = [MASTERS_LEAGUE_ID, 'golf_us_open_winner'];
  const isFuturesOnly = (id: string) => FUTURES_ONLY_LEAGUES.includes(id);

  // Check if current league supports props
  const supportsProps = PROPS_SUPPORTED_LEAGUES.includes(activeLeague);
  // The last tab (NCAAF "Ratings", NFL "Ledger") is odds.day's own ratings, so
  // it goes away when the account menu's "odds.day projections" is off.
  const hasRatingsTab =
    prefs.showProjections && (activeLeague === RATINGS_LEAGUE || activeLeague === 'americanfootball_nfl');
  useEffect(() => {
    if (!prefs.showProjections && activeView === 'ratings') setActiveView('games');
  }, [prefs.showProjections, activeView]);

  // Set isClient to true when component mounts on client side
  useEffect(() => {
    setIsClient(true);
    
    // Check for cross-navigation from ratings Schedule tab
    const ratingsNav = sessionStorage.getItem('ratingsNav');
    if (ratingsNav) {
      sessionStorage.removeItem('ratingsNav');
      try {
        const { league, search } = JSON.parse(ratingsNav);
        if (league) setActiveLeague(league);
        if (search) setTeamFilter(search);
        setActiveView('games');
        crossNavSearchRef.current = true;
      } catch (e) {
        console.error('Error parsing ratingsNav:', e);
      }
    } else if (!initialLeague) {
      // Load saved league from localStorage after client-side hydration.
      // Skip leagues that have since been hidden (isActive=false) — restoring
      // one would land on a tab that no longer exists. A sport page (/nfl)
      // forces its own league, so the saved one is ignored there.
      const savedLeague = localStorage.getItem('activeLeague');
      if (savedLeague && (savedLeague === 'favorites' || LEAGUES.some(l => l.id === savedLeague && l.isActive))) {
        setActiveLeague(savedLeague);
      }
    }
    
    // Load saved bookmaker selection from localStorage.
    // Bookmakers added to the app AFTER the selection was saved auto-enable —
    // otherwise a stale saved list hides new books (e.g. Kalshi) forever.
    const savedBookmakers = localStorage.getItem('selectedBookmakers');
    if (savedBookmakers) {
      try {
        const parsed = JSON.parse(savedBookmakers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let known: string[] = [];
          try {
            const k = JSON.parse(localStorage.getItem('knownBookmakers') ?? '[]');
            if (Array.isArray(k)) known = k;
          } catch { /* ignore */ }
          const newBooks = BOOKMAKERS.filter(b =>
            known.length > 0 ? !known.includes(b) : !parsed.includes(b)
          );
          setSelectedBookmakers([...new Set([...parsed, ...newBooks])]);
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

  // Handle URL params for shared game/futures links. Read from the window on
  // mount rather than useSearchParams(): that hook would force the whole
  // board to client-render (no HTML for crawlers) on the ISR sport pages.
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const gameId = searchParams.get('game');
    const leagueId = searchParams.get('league');
    const view = searchParams.get('view');

    if (gameId && leagueId) {
      // Set the league from URL
      setActiveLeague(leagueId);
      setActiveView('games');
      setHighlightedGameId(gameId);
    } else if (view === 'mybets') {
      // Shared bet link (/bet/[id] redirects here)
      setActiveView('mybets');
    } else if (leagueId || view) {
      // Any shared tab: /?league=<id>&view=<games|futures|props>[&event=<id>]
      if (leagueId) setActiveLeague(leagueId);
      if (view === 'games' || view === 'futures' || view === 'props' || view === 'ratings') {
        setActiveView(view);
      }
      const eventId = searchParams.get('event');
      if (view === 'props' && eventId) pendingPropsEventRef.current = eventId;
    }
  }, []);

  // Deferred props-event deep link: the event list has to load before the
  // shared event can be selected.
  const pendingPropsEventRef = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingPropsEventRef.current;
    if (!id || propsEvents.length === 0) return;
    const event = propsEvents.find((e) => e.id === id);
    pendingPropsEventRef.current = null;
    if (event) loadPropsForEvent(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsEvents]);

  // Mirror the active tab into the URL (replaceState — no history spam, no
  // Next re-render) so every view is shareable. `game` is inbound-only: it
  // highlights once and should not stick to copied links.
  useEffect(() => {
    if (!isClient) return;
    const params = new URLSearchParams(window.location.search);
    // Leagues with a server-rendered page live at /<slug> (the crawlable
    // URL); favorites and anything without a page keep /?league=
    const slug = slugForSportKey(activeLeague);
    if (slug) params.delete('league');
    else params.set('league', activeLeague);
    params.set('view', activeView);
    if (activeView === 'props' && selectedPropsEvent) {
      params.set('event', selectedPropsEvent.id);
    } else {
      params.delete('event');
    }
    params.delete('game');
    const qs = params.toString();
    window.history.replaceState(null, '', `${slug ? `/${slug}` : '/'}${qs ? `?${qs}` : ''}`);
  }, [isClient, activeLeague, activeView, selectedPropsEvent]);

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

  // Coming back from a team page: the board's games load after mount, so the
  // browser's scroll restore finds an empty page. OddsTable stashes the card
  // we left from; once that league's games are rendered, jump back to it.
  useEffect(() => {
    if (loading || games.length === 0) return;
    let marker: { league?: string; gameId?: string; y?: number; at?: number } | null = null;
    try {
      const raw = sessionStorage.getItem('oddsday:return');
      marker = raw ? JSON.parse(raw) : null;
    } catch {
      marker = null;
    }
    if (!marker || marker.league !== activeLeague) return;
    if (typeof marker.at === 'number' && Date.now() - marker.at > 60 * 60 * 1000) {
      sessionStorage.removeItem('oddsday:return');
      return;
    }
    sessionStorage.removeItem('oddsday:return');
    const { gameId, y } = marker;
    // The router's own scroll restore and late layout (logos, live scores,
    // the tip banner) can land after a single scroll and undo it — that was
    // the "works half the time". Re-assert over the first two seconds and
    // stop once the card has sat centred across two consecutive checks.
    const timers: number[] = [];
    let settled = 0;
    const attempt = () => {
      const el = gameId ? document.getElementById(`game-${gameId}`) : null;
      if (el) {
        const r = el.getBoundingClientRect();
        const centred = Math.abs(r.top + r.height / 2 - window.innerHeight / 2) < 48;
        if (centred) {
          settled++;
          if (settled >= 2) return true;
        } else {
          settled = 0;
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
      } else if (typeof y === 'number' && Math.abs(window.scrollY - y) > 8) {
        window.scrollTo(0, y);
      }
      return false;
    };
    for (const ms of [30, 150, 350, 650, 1000, 1500, 2200]) {
      timers.push(window.setTimeout(() => {
        if (attempt()) timers.forEach((t) => window.clearTimeout(t));
      }, ms));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [loading, games, activeLeague]);

  // Force futures view for futures-only leagues, reset props when league changes
  useEffect(() => {
    if (isFuturesOnly(activeLeague)) {
      setActiveView('futures');
    }
    // If switching to a league that doesn't support props while on props view, switch to games
    if (activeView === 'props' && !PROPS_SUPPORTED_LEAGUES.includes(activeLeague)) {
      setActiveView('games');
    }
    // The in-page Ratings view exists for NCAAF only
    if (activeView === 'ratings' && activeLeague !== RATINGS_LEAGUE) {
      setActiveView('games');
    }
    if (crossNavSearchRef.current) {
      crossNavSearchRef.current = false;
    } else {
      setTeamFilter('');
    }
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

  // Save selected bookmakers to localStorage, plus the app's bookmaker list at
  // save time — so future additions to BOOKMAKERS can be told apart from books
  // the user deliberately deselected.
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('selectedBookmakers', JSON.stringify(selectedBookmakers));
      localStorage.setItem('knownBookmakers', JSON.stringify(BOOKMAKERS));
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

  // Starred games live on the account when signed in (src/lib/favorites.ts):
  // once the session is known, swap the device's list for the account's
  // (stars made while signed out are carried over); signed out, drop a list
  // that belonged to an account.
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setFavoriteGames(favoritesWhenSignedOut());
      return;
    }
    let alive = true;
    syncFavorites(user.id).then((list) => {
      if (alive && list) setFavoriteGames(list);
    });
    return () => {
      alive = false;
    };
  }, [authReady, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle favorite game (and save the change to the account when signed in)
  const toggleFavoriteGame = (gameId: string) => {
    const starred = !favoriteGames.includes(gameId);
    setFavoriteGames(prev =>
      starred ? (prev.includes(gameId) ? prev : [...prev, gameId]) : prev.filter(id => id !== gameId)
    );
    if (user) saveFavorite(user.id, gameId, starred);
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
        .filter(l => l.isActive && !isFuturesOnly(l.id))
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

  // Monotonic id per loadData run: a response that comes back after a newer
  // run started must not touch state — on cold load the default-league (NBA)
  // fetch used to race the restored league's fetch and paint NBA cards under
  // the NCAAF tab; fast tab-switching had the same flash.
  const loadSeqRef = useRef(0);

  // Load data from cache or API
  const loadData = useCallback(async function() {
    const seq = ++loadSeqRef.current;
    const stale = () => loadSeqRef.current !== seq;
    if (activeView === 'mybets' || activeView === 'ratings') {
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
    
    const needsGames = activeView === 'games' && !isFuturesOnly(activeLeague);
    const needsFutures = activeView === 'futures' || isFuturesOnly(activeLeague);
    
    try {
      let gamesLoaded = false;
      let futuresLoaded = false;
      
      if (needsGames) {
        if (isValidCache(gamesCache, activeLeague)) {
          setGames(gamesCache[activeLeague].data);
          gamesLoaded = true;
        } else {
          const response = await fetchOdds(activeLeague);
          // cache regardless (keyed by league), but only render if current
          setGamesCache(prev => ({
            ...prev,
            [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
          }));
          if (stale()) return;
          setGames(response.data);
          setApiRequestsRemaining(response.requestsRemaining);
          gamesLoaded = true;
        }
      }
      
      if (needsFutures) {
        if (isValidCache(futuresCache, activeLeague)) {
          setFutures(futuresCache[activeLeague].data);
          futuresLoaded = true;
        } else {
          const response = await fetchFutures(activeLeague);
          setFuturesCache(prev => ({
            ...prev,
            [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
          }));
          if (stale()) return;
          setFutures(response.data);
          setApiRequestsRemaining(response.requestsRemaining);
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
          if (!stale()) setEspnScores(scores);
        } catch (error) {
          console.error('Error fetching ESPN scores:', error);
        }
        
        // Fetch NHL rest data (only for NHL)
        if (activeLeague === 'icehockey_nhl') {
          try {
            const restData = await fetchNHLRestData();
            setNhlRestData(restData);
          } catch (error) {
            console.error('Error fetching NHL rest data:', error);
          }
        } else {
          setNhlRestData([]); // Clear rest data for non-NHL leagues
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      // a newer run owns the spinner now — clearing it here would reveal
      // the previous league's board mid-load
      if (!stale()) setLoading(false);
    }
  }, [activeLeague, activeView, gamesCache, futuresCache, loadPropsEvents]);

  // Force refresh (bypass cache)
  const forceRefresh = useCallback(async function() {
    if (activeLeague === 'favorites') {
      setFavoritesLoading(true);
      try {
        const now = Date.now();
        const activeLeagueIds = LEAGUES
          .filter(l => l.isActive && !isFuturesOnly(l.id))
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
      
      if (activeView === 'games' && !isFuturesOnly(activeLeague)) {
        const response = await fetchOdds(activeLeague);
        setGames(response.data);
        setApiRequestsRemaining(response.requestsRemaining);
        setGamesCache(prev => ({
          ...prev,
          [activeLeague]: { data: response.data, timestamp: now, league: activeLeague }
        }));
        
        // Also refresh NHL rest data on force refresh
        if (activeLeague === 'icehockey_nhl') {
          try {
            const restData = await fetchNHLRestData();
            setNhlRestData(restData);
          } catch (error) {
            console.error('Error fetching NHL rest data:', error);
          }
        }
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
  
  // Load data when league or view changes. Gated on isClient so the mount
  // pass never fetches the DEFAULT league — the saved league from
  // localStorage (and any URL params) land in the same batch that sets
  // isClient, so the first real fetch is for the league actually shown
  // (the old phantom NBA fetch also burned an Odds API call per cold load).
  useEffect(() => {
    if (!isClient) return;
    if (activeView !== 'mybets' && activeLeague !== 'favorites') {
      loadData();
    } else if (activeLeague === 'favorites') {
      setLoading(false);
    }
  }, [isClient, loadData, activeView, activeLeague]);

  // Force the effective view for rendering
  const effectiveView: 'games' | 'futures' | 'props' | 'ratings' | 'mybets' = isFuturesOnly(activeLeague) ? 'futures' : activeView;

  // Filter games based on team name AND conferences
  const [showLiveGames, setShowLiveGames] = useState(false);
  // Remembered per device; read after mount so server and first client render agree
  useEffect(() => {
    try {
      if (localStorage.getItem('showLiveGames') === '1') setShowLiveGames(true);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleLiveGames = () => {
    const next = !showLiveGames;
    setShowLiveGames(next);
    try {
      localStorage.setItem('showLiveGames', next ? '1' : '0');
    } catch {
      /* not remembered */
    }
  };
  // Games under way (kicked off, not final) — the number on the Live chip
  const liveCount = useMemo(() => {
    const now = Date.now();
    return games.filter(
      (game) => new Date(game.commence_time).getTime() <= now && matchGameToScore(game, espnScores)?.state !== 'post'
    ).length;
  }, [games, espnScores]);
  const filteredGames = useMemo(() => {
    // A game that has gone final (per the ESPN scores feed) has nothing left
    // to price — drop its card. Games the feed can't match stay, so an empty
    // or failed feed never hides anything.
    let filtered = games.filter((game) => matchGameToScore(game, espnScores)?.state !== 'post');

    // Live games (kicked off, not final) are hidden unless the Live switch is on
    if (!showLiveGames) {
      const now = Date.now();
      filtered = filtered.filter((game) => new Date(game.commence_time).getTime() > now);
    }

    if (teamFilter.trim()) {
      filtered = filtered.filter(game => teamMatches(game.home_team, teamFilter) || teamMatches(game.away_team, teamFilter));
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
  }, [games, teamFilter, teamMatches, selectedConferences, activeLeague, espnScores, showLiveGames]);

  // Filter futures based on team/player name
  const filteredFutures = futures.map(market => ({
    ...market,
    teams: market.teams.filter(team => {
      if (!teamFilter.trim()) return true;
      return teamMatches(team.team, teamFilter);
    })
  })).filter(market => market.teams.length > 0);

  // Filter props events based on team name
  const filteredPropsEvents = useMemo(() => {
    if (!teamFilter.trim()) return propsEvents;
    return propsEvents.filter(event => teamMatches(event.home_team, teamFilter) || teamMatches(event.away_team, teamFilter));
  }, [propsEvents, teamFilter, teamMatches]);

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
      minute: '2-digit',
      ...zoneOption(prefs.timeZone),
    });
  };

  // Games-view filter controls, built once and placed twice: in a row under
  // the tabs on phones/tablets, and at the right end of the tab bar on wide
  // screens (only one of the two is ever displayed).
  const searchButton = (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      aria-label="Search teams"
      className="flex-none inline-flex h-9 w-9 items-center justify-center bg-white border border-gray-300 rounded-lg shadow-sm text-gray-500 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </button>
  );
  // Phones and tablets: the same icon at the end of the tab row; it opens the
  // search box under the tabs and closes (and clears) it again.
  const searchToggle = (
    <button
      type="button"
      onClick={() => (searchShown ? closeSearch() : setSearchOpen(true))}
      aria-label={searchShown ? 'Close search' : 'Search teams'}
      aria-expanded={searchShown}
      className={`inline-flex h-[38px] w-9 items-center justify-center rounded-lg border shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        searchShown ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
      }`}
    >
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </button>
  );
  // compact = the 36px, fixed-width version that fits inside the tab bar
  const searchInput = (compact: boolean) => (
    <div className={`relative ${compact ? 'w-64' : ''}`}>
      <input
        type="text"
        placeholder="Filter by team name..."
        value={teamFilter}
        onChange={(e) => setTeamFilter(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
        autoFocus={searchOpen}
        className={`w-full pl-10 pr-10 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
          compact ? 'h-9 text-sm' : 'px-4 py-2'
        }`}
      />
      <div className="absolute inset-y-0 left-0 flex items-center pl-3">
        <svg className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <button
        onClick={closeSearch}
        aria-label="Close search"
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
      >
        <svg className={compact ? 'w-4 h-4' : 'w-5 h-5'} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
  const conferenceControl = supportsConferenceFilter && (
    <div className="flex-none">
      <ConferenceFilter
        activeLeague={activeLeague}
        selectedConferences={selectedConferences}
        onConferencesChange={setSelectedConferences}
      />
    </div>
  );
  // Ratings view: FBS / FCS division switch (also placed twice, like the filters)
  const ratingsSwitch = (
    <div className="inline-flex rounded-lg bg-gray-200/80 p-0.5">
      {(['fbs', 'fcs'] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setRatingsDivision(d)}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            ratingsDivision === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {d === 'fbs' ? 'FBS Ratings' : 'FCS Ratings'}
        </button>
      ))}
    </div>
  );
  // Live chip: only while games are under way. Off (plain) hides them; on
  // (light red tint) shows them. The count says how many.
  const liveChip = liveCount > 0 && (
    <button
      type="button"
      aria-pressed={showLiveGames}
      title={showLiveGames ? 'Hide games in progress' : 'Show games in progress'}
      onClick={toggleLiveGames}
      className={`flex-none inline-flex h-9 items-center gap-1.5 px-2.5 rounded-lg border text-sm font-semibold shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 ${
        showLiveGames
          ? 'bg-red-50 border-red-200 text-red-700'
          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-red-500" />
      Live {liveCount}
    </button>
  );

  return (
    <main className="min-h-screen bg-blue-50">
      {/* Sticky: logo, book selector and Bets stay reachable while scrolling */}
      <header className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Wordmark links home; the page's h1 is the league heading below the nav */}
            <Link href="/" className="text-xl sm:text-[26px] font-bold tracking-[-0.8px] shrink-0"><span className="text-blue-600">odds</span><span className="text-gray-900">.day</span></Link>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {activeView !== 'mybets' && (
                <BookmakerSelector
                  selectedBookmakers={selectedBookmakers}
                  onSelectionChange={setSelectedBookmakers}
                />
              )}

              {/* Ratings Button - Only show for NCAAB */}
              {activeLeague === 'basketball_ncaab' && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsHolding(true);
                    pressTimer.current = setTimeout(() => {
                      setIsHolding(false);
                      router.push('/ratings?admin=true');
                    }, 2000);
                  }}
                  onMouseUp={() => {
                    setIsHolding(false);
                    if (pressTimer.current) {
                      clearTimeout(pressTimer.current);
                      pressTimer.current = null;
                      router.push('/ratings');
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
                      router.push('/ratings?admin=true');
                    }, 2000);
                  }}
                  onTouchEnd={() => {
                    setIsHolding(false);
                    if (pressTimer.current) {
                      clearTimeout(pressTimer.current);
                      pressTimer.current = null;
                      router.push('/ratings');
                    }
                  }}
                  className={`px-2 sm:px-3 py-2 rounded-xl text-sm font-medium transition-all select-none border border-gray-200 shadow-sm bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap ${isHolding ? 'scale-95 ring-2 ring-purple-400' : ''}`}
                  style={{ userSelect: 'none' }}
                >
                  📈 Ratings {isHolding && '...'}
                </button>
              )}

              {/* Ratings Button - Only show for NCAAL */}
              {activeLeague === 'lacrosse_ncaa' && (
                <button
                  onClick={() => router.push('/lacrosse-ratings')}
                  className="px-2 sm:px-3 py-2 rounded-xl text-sm font-medium transition-all select-none border border-gray-200 shadow-sm bg-purple-100 text-purple-700 hover:bg-purple-200 whitespace-nowrap"
                >
                  📈 Ratings
                </button>
              )}

              {/* Signed out: Sign in takes the Bets slot (held invisible until the
                  stored session is read, so the header doesn't jump). Signed in:
                  Bets + the account button. */}
              {!user && (
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  className={`px-2 sm:px-3 py-2 rounded-xl text-sm font-medium transition-all select-none border border-gray-200 shadow-sm whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 ${authReady ? '' : 'invisible'}`}
                >
                  Sign in
                </button>
              )}

              {user && (
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
                className={`px-2 sm:px-3 py-2 rounded-xl text-sm font-medium transition-all select-none border border-gray-200 shadow-sm whitespace-nowrap ${
                  activeView === 'mybets'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } ${isHolding ? 'scale-95 ring-2 ring-blue-400' : ''}`}
                style={{ userSelect: 'none' }}
              >
                📊 Bets {isHolding && '...'}
              </button>
              )}

              {user && <AccountButton user={user} />}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {activeView === 'mybets' ? (
          <div className="mb-6 flex items-center justify-between gap-3">
            <button
              onClick={() => setActiveView('games')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Odds
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span className="hidden sm:inline">Year</span>
              <select
                value={betYear === 'all' ? 'all' : String(betYear)}
                onChange={(e) => setBetYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
                className="px-2 py-1.5 rounded-md border border-gray-200 bg-white text-sm font-medium text-gray-700 shadow-sm"
                aria-label="Filter bets by year"
              >
                <option value="all">All-Time</option>
                {betYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
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

            {/* Page heading for search engines only — the one h1 so /nfl can
                rank for "NFL odds". Visually hidden (Tyler's call 2026-10-07):
                the active league pill already says where you are. */}
            {activeLeague !== 'favorites' && (
              <h1 className="sr-only">
                {(LEAGUES.find(l => l.id === activeLeague)?.name ?? '')}{' '}
                {effectiveView === 'futures' ? 'Futures Odds' : effectiveView === 'props' ? 'Player Props' : effectiveView === 'ratings' ? 'Power Ratings' : 'Odds Today'}
              </h1>
            )}

            {/* View tabs — first under the league row on every view, so they never
                move when the view changes. Not shown for favorites. */}
            {activeLeague !== 'favorites' && (
              isFuturesOnly(activeLeague) ? (
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex justify-center">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button type="button" className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white border border-gray-200">
                      Futures
                    </button>
                  </div>
                </div>
              ) : (
                // Wide screens: three columns — spacer, tabs (centred), Games filters (right).
                // Phones and tablets: tabs, then the search icon at the right end; the
                // search box opens on a second line inside the same card.
                <div className="bg-white rounded-lg shadow p-2 mb-6 flex flex-wrap items-center gap-x-2 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-x-0">
                  <div className="hidden lg:block" />
                  <div className="flex flex-1 justify-center lg:block">
                  <div className="inline-flex rounded-md shadow-sm">
                    <button
                      type="button"
                      className={`px-2.5 min-[400px]:px-4 py-2 text-sm font-medium rounded-l-lg ${
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
                      className={`px-2.5 min-[400px]:px-4 py-2 text-sm font-medium ${
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
                        className={`px-2.5 min-[400px]:px-4 py-2 text-sm font-medium ${
                          hasRatingsTab ? '' : 'rounded-r-lg '
                        }${
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
                    {hasRatingsTab && activeLeague === RATINGS_LEAGUE && (
                      <button
                        type="button"
                        className={`px-2.5 min-[400px]:px-4 py-2 text-sm font-medium rounded-r-lg ${
                          activeView === 'ratings' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                        } border border-gray-200 border-l-0`}
                        onClick={() => {
                          setActiveView('ratings');
                          setTeamFilter('');
                          setSelectedConferences([]);
                          setSelectedPropsEvent(null);
                          setPlayerFilter('');
                        }}
                      >
                        Ratings
                      </button>
                    )}
                    {hasRatingsTab && activeLeague === 'americanfootball_nfl' && (
                      <button
                        type="button"
                        className="px-2.5 min-[400px]:px-4 py-2 text-sm font-medium rounded-r-lg bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 border-l-0"
                        onClick={() => router.push('/nfl/ratings')}
                      >
                        Ledger
                      </button>
                    )}
                  </div>
                  </div>
                  {/* kept (invisible) off the Games view so the tabs never shift */}
                  <div className={`flex-none lg:hidden ${effectiveView === 'games' ? '' : 'invisible'}`}>{searchToggle}</div>
                  <div className="hidden lg:flex items-center justify-end gap-2">
                    {effectiveView === 'games' && (
                      <>
                        {searchShown ? searchInput(true) : searchButton}
                        {conferenceControl}
                        {liveChip}
                      </>
                    )}
                    {effectiveView === 'ratings' && ratingsSwitch}
                  </div>
                  {effectiveView === 'games' && searchShown && (
                    <div className="mt-2 basis-full lg:hidden">{searchInput(false)}</div>
                  )}
                </div>
              )
            )}
            
            {/* Games filters. Phones and tablets: conference filter and Live chip on
                a row under the tabs — only when the league has one of them (search
                lives in the tab card). Wide screens: the same controls sit at the
                right end of the tab bar, so this block is only the active-filter
                chips there. */}
            {effectiveView === 'games' && activeLeague !== 'favorites' && (
              <div className={`space-y-4 lg:mb-0 lg:space-y-0 ${supportsConferenceFilter || liveCount > 0 || teamFilter || selectedConferences.length > 0 ? 'mb-6' : ''}`}>
                {(supportsConferenceFilter || liveCount > 0) && (
                  <div className="flex min-h-[42px] items-center gap-2 lg:hidden">
                    {conferenceControl}
                    {liveChip}
                  </div>
                )}

                {(teamFilter || selectedConferences.length > 0) && (
                  <div className="flex flex-wrap gap-2 items-center lg:mb-6">
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

            {/* Ratings view: which division. Under the tabs on phones/tablets; on
                wide screens it sits at the right end of the tab bar instead. */}
            {effectiveView === 'ratings' && <div className="mb-4 flex justify-center lg:hidden">{ratingsSwitch}</div>}

            {/* Tap hint - games view, and only until this device has tapped a price once.
                Shown once, so it can afford to say what a tap does. */}
            {showTapHint && activeView === 'games' && activeLeague !== 'favorites' && (
              <div className="mb-4 flex items-start justify-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-xs leading-snug text-gray-600">
                <svg className="mt-px h-4 w-4 flex-none text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <p>
                  <span className="font-semibold text-gray-800">
                    <span className="md:hidden">Tap</span>
                    <span className="hidden md:inline">Click</span> any price.
                  </span>{' '}
                  {user
                    ? 'A ticket opens where you can send the bet to that sportsbook, track it in your bets, or both.'
                    : 'It opens that bet at the sportsbook, with the selection loaded where the book supports it. Sign in to track your bets here too.'}
                </p>
              </div>
            )}
            
            {/* NHL Rest Badges Key - only show for NHL */}
            {activeView === 'games' && activeLeague === 'icehockey_nhl' && nhlRestData.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-gray-600 mb-4">
                <span className="text-gray-500">Rest Key:</span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">B2B</span>
                  <span>Back-to-back</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">3in4</span>
                  <span>3 games in 4 days</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">4in6</span>
                  <span>4 games in 6 days</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">2RA</span>
                  <span>2+ day rest advantage</span>
                </span>
              </div>
            )}
          </>
        )}

        {/* Main Content */}
        {activeView === 'mybets' && !user ? (
          // Bets are private to their owner; a shared bet link lands here signed out
          authReady && (
            <div className="rounded-xl bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-gray-600">Sign in to track your own bets.</p>
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                Sign in with Google
              </button>
            </div>
          )
        ) : activeView === 'mybets' ? (
          <MyBets yearFilter={betYear} onYearsLoaded={setBetYears} />
        ) : effectiveView === 'ratings' ? (
          // Ledger ratings in the page (like Futures), one division at a time
          <div className="min-h-[80vh]">
            {ratingsDivision === 'fbs' ? <FbsRatingsView embedded /> : <FcsRatingsView embedded />}
          </div>
        ) : loading || (activeLeague === 'favorites' && favoritesLoading) ? (
          <BoardLoading variant={effectiveView === 'futures' ? 'futures' : 'games'} />
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
                    {favoritedGamesFromCache.map(game => (
                      <GameCard 
                        key={game.id} 
                        game={game} 
                        selectedBookmakers={selectedBookmakers}
                        isFavorite={true}
                        onToggleFavorite={toggleFavoriteGame}
                        liveScore={matchGameToScore(game, espnScores)}
                        highlightedGameId={highlightedGameId}
                        restData={game.sport_key === 'icehockey_nhl' ? matchGameToRestData(game.home_team, game.away_team, nhlRestData) : null}
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
                      : !showLiveGames && games.length > 0
                        ? 'Only live games right now — tap Live above to see them.'
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
                        restData={activeLeague === 'icehockey_nhl' ? matchGameToRestData(game.home_team, game.away_team, nhlRestData) : null}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : effectiveView === 'props' ? (
              <div>
                {propsLoading ? (
                  <OddsLoader label="Loading props" />
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
                      event={selectedPropsEvent}
                      league={activeLeague}
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
                        isMasters={isFuturesOnly(activeLeague)}
                        selectedBookmakers={selectedBookmakers}
                        league={activeLeague}
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

export default function OddsBoard(props: OddsBoardProps) {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gray-100">
        <div className="flex justify-center items-center h-screen">
          <OddsLoader label="Loading odds.day" />
        </div>
      </main>
    }>
      <HomeContent {...props} />
    </Suspense>
  );
}
