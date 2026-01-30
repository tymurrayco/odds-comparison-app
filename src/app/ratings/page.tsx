// src/app/ratings/page.tsx

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { 
  RatingsSnapshot, 
  GameAdjustment, 
  ClosingLineSource,
} from '@/lib/ratings/types';
import { 
  DEFAULT_RATINGS_CONFIG, 
  CLOSING_LINE_SOURCES,
} from '@/lib/ratings/constants';
import { formatSpread, formatRating } from '@/lib/ratings/engine';

// Custom debounce hook for search inputs
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  
  return debouncedValue;
}

interface MatchingLog {
  gameId: string;
  gameDate: string;
  espnHome: string;
  espnAway: string;
  matchedHome: string | null;
  matchedAway: string | null;
  homeFound: boolean;
  awayFound: boolean;
  status: 'success' | 'home_not_found' | 'away_not_found' | 'both_not_found' | 'no_odds' | 'no_spread';
  skipReason: string | null;
  closingSpread: number | null;
}

interface MatchingStats {
  total: number;
  success: number;
  homeNotFound: number;
  awayNotFound: number;
  bothNotFound: number;
  noOdds: number;
  noSpread: number;
}

interface TeamOverride {
  id?: number;
  sourceName: string;
  kenpomName: string;
  espnName?: string;
  oddsApiName?: string;
  torvikName?: string;
  source: string;
  notes?: string;
}

interface CalculateResponse {
  success: boolean;
  error?: string;
  lastCalculated?: string;
  syncRange?: {
    firstGameDate: string | null;
    lastGameDate: string | null;
  };
  config?: {
    hca: number;
    closingSource: ClosingLineSource;
    season: number;
  };
  summary?: {
    teamsCount: number;
    gamesProcessed: number;
    newGamesProcessed?: number;
    gamesSkipped?: number;
    topTeams?: Array<{ team: string; rating: number }>;
  };
  data?: RatingsSnapshot;
  matchingLogs?: MatchingLog[];
  matchingStats?: MatchingStats;
}

// Barttorvik interfaces
interface BTGame {
  date: string;
  time: string;
  away_team: string;
  home_team: string;
  away_rank?: number;
  home_rank?: number;
  spread?: number;
  total?: number;
  away_score?: number;
  home_score?: number;
  status: 'scheduled' | 'in_progress' | 'final';
  venue?: string;
  neutral?: boolean;
  predicted_spread?: number;
  predicted_total?: number;
  away_win_prob?: number;
  home_win_prob?: number;
}

interface BTRating {
  rank: number;
  team: string;
  conf: string;
  record: string;
  adj_o: number;
  adj_d: number;
  adj_t: number;
  barthag: number;
}

type TabType = 'ratings' | 'hypotheticals' | 'schedule' | 'history' | 'matching' | 'overrides' | 'barttorvik';

export default function RatingsPage() {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RatingsSnapshot | null>(null);
  const [syncRange, setSyncRange] = useState<{ firstGameDate: string | null; lastGameDate: string | null } | null>(null);
  
  // Check if running locally
  const [isLocalhost, setIsLocalhost] = useState(false);
  useEffect(() => {
    setIsLocalhost(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);
  
  // Matching logs state
  const [matchingLogs, setMatchingLogs] = useState<MatchingLog[]>([]);
  const [matchingStats, setMatchingStats] = useState<MatchingStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [nonD1GameIds, setNonD1GameIds] = useState<Set<string>>(new Set());
  
  // Overrides state
  const [overrides, setOverrides] = useState<TeamOverride[]>([]);
  const [kenpomTeams, setKenpomTeams] = useState<string[]>([]);
  const [oddsApiTeams, setOddsApiTeams] = useState<string[]>([]);
  const [torvikTeams, setTorvikTeams] = useState<string[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TeamOverride | null>(null);
  const [newOverride, setNewOverride] = useState({ sourceName: '', kenpomName: '', espnName: '', oddsApiName: '', torvikName: '', notes: '' });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [kenpomSearch, setKenpomSearch] = useState('');
  const [showKenpomDropdown, setShowKenpomDropdown] = useState(false);
  const [oddsApiSearch, setOddsApiSearch] = useState('');
  const [showOddsApiDropdown, setShowOddsApiDropdown] = useState(false);
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineOddsApiSearch, setInlineOddsApiSearch] = useState('');
  const [showInlineOddsApiDropdown, setShowInlineOddsApiDropdown] = useState(false);
  const [inlineTorvikSearch, setInlineTorvikSearch] = useState('');
  const [showInlineTorvikDropdown, setShowInlineTorvikDropdown] = useState(false);
  
  // Refs for inline editing (avoids re-renders on typing)
  const inlineSourceNameRef = React.useRef<HTMLInputElement>(null);
  const inlineKenpomNameRef = React.useRef<HTMLInputElement>(null);
  const inlineEspnNameRef = React.useRef<HTMLInputElement>(null);
  const inlineOddsApiRef = React.useRef<HTMLInputElement>(null);
  const inlineTorvikRef = React.useRef<HTMLInputElement>(null);
  const inlineNotesRef = React.useRef<HTMLInputElement>(null);
  
  // Debounced search values (150ms delay for smoother typing)
  const debouncedKenpomSearch = useDebounce(kenpomSearch, 150);
  const debouncedOddsApiSearch = useDebounce(oddsApiSearch, 150);
  const debouncedInlineOddsApiSearch = useDebounce(inlineOddsApiSearch, 150);
  const debouncedInlineTorvikSearch = useDebounce(inlineTorvikSearch, 150);
  
  // Matchups state
  const [homeTeam, setHomeTeam] = useState<string>('');
  const [awayTeam, setAwayTeam] = useState<string>('');
  const [isNeutralSite, setIsNeutralSite] = useState(false);
  const [homeTeamSearch, setHomeTeamSearch] = useState('');
  const [awayTeamSearch, setAwayTeamSearch] = useState('');
  const [showHomeDropdown, setShowHomeDropdown] = useState(false);
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);
  
  // Schedule state
  interface ScheduleGame {
    id: string;
    commenceTime: string;
    homeTeam: string;
    awayTeam: string;
    spread: number | null;
    openingSpread: number | null;
    total: number | null;
    spreadBookmaker: string | null;
    isToday: boolean;
    isTomorrow: boolean;
    hasStarted: boolean;
    isFrozen: boolean;
  }
  const [scheduleGames, setScheduleGames] = useState<ScheduleGame[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'today' | 'tomorrow' | 'day2' | 'day3'>('all');
  const [scheduleSortBy, setScheduleSortBy] = useState<'time' | 'delta' | 'awayMovement' | 'homeMovement'>('time');
  const [scheduleSortDir, setScheduleSortDir] = useState<'asc' | 'desc'>('asc');
  
  // Combined schedule (BT primary + Odds API enrichment)
  interface CombinedScheduleGame {
    // BT data (always present)
    id: string;
    gameDate: string; // YYYY-MM-DD format
    gameTime: string;
    homeTeam: string; // BT team name
    awayTeam: string; // BT team name
    btSpread: number | null;
    btTotal: number | null;
    homeWinProb: number | null;
    awayWinProb: number | null;
    // Odds API data (may be null if no odds yet)
    oddsGameId: string | null;
    spread: number | null;
    openingSpread: number | null;
    total: number | null;
    spreadBookmaker: string | null;
    hasStarted: boolean;
    isFrozen: boolean;
    // Computed
    isToday: boolean;
    isTomorrow: boolean;
    isDay2: boolean;
    isDay3: boolean;
    dateLabel: string; // "Today", "Tomorrow", "Jan 31", etc.
  }
  const [combinedScheduleGames, setCombinedScheduleGames] = useState<CombinedScheduleGame[]>([]);
  
  // History state (from ncaab_game_adjustments)
  interface HistoryGame {
    id: string;
    gameDate: string;
    homeTeam: string;
    awayTeam: string;
    projectedSpread: number | null;
    openingSpread: number | null;
    closingSpread: number | null;
    closingSource: string | null;
    difference: number | null;
  }
  const [historyGames, setHistoryGames] = useState<HistoryGame[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyStartDate, setHistoryStartDate] = useState<string>('');
  const [historyEndDate, setHistoryEndDate] = useState<string>('');
  const [historyDiffMin, setHistoryDiffMin] = useState<number>(0);
  const [historyDiffMinDisplay, setHistoryDiffMinDisplay] = useState<number>(0);
  type HistorySortField = 'date' | 'diff' | 'awayMovement' | 'homeMovement';
  type SortDirection = 'asc' | 'desc';
  const [historySortField, setHistorySortField] = useState<HistorySortField>('date');
  const [historySortDirection, setHistorySortDirection] = useState<SortDirection>('desc');
  
  // Barttorvik state
  const [btGames, setBtGames] = useState<BTGame[]>([]);
  const [btRatings, setBtRatings] = useState<BTRating[]>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btView, setBtView] = useState<'schedule' | 'ratings'>('schedule');
  const [btSearchTerm, setBtSearchTerm] = useState('');
  
  // Config state
  const [hca, setHca] = useState(DEFAULT_RATINGS_CONFIG.hca);
  const [closingSource, setClosingSource] = useState<ClosingLineSource>(
    DEFAULT_RATINGS_CONFIG.closingSource
  );
  const [syncStartDate, setSyncStartDate] = useState('');
  const [syncEndDate, setSyncEndDate] = useState('');
  const [maxGames, setMaxGames] = useState(100);
  
  // View state
  const [activeTab, setActiveTab] = useState<TabType>('ratings');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'rating' | 'name' | 'games' | 'change' | 'initial'>('rating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'failed'>('failed');
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  
  // Load existing ratings on mount
  useEffect(() => {
    loadRatings();
    loadTeamLogos();
  }, []);
  
  const [espnNameMap, setEspnNameMap] = useState<Record<string, string>>({});
  
  const loadTeamLogos = async () => {
    try {
      const response = await fetch('/api/ratings/team-logos');
      const data = await response.json();
      if (data.success && data.logos) {
        setTeamLogos(data.logos);
        if (data.espnNameMap) {
          setEspnNameMap(data.espnNameMap);
        }
      }
    } catch {
      console.log('Failed to load team logos');
    }
  };
  
  // Helper to get logo URL for a team name
  const getTeamLogo = (teamName: string): string | null => {
    const normalized = teamName.toLowerCase();
    
    // First check if we have an ESPN name override for this team
    const espnName = espnNameMap[normalized];
    if (espnName && teamLogos[espnName]) {
      return teamLogos[espnName];
    }
    
    // Try exact match
    if (teamLogos[normalized]) return teamLogos[normalized];
    
    // Try without periods (KenPom uses "St." but ESPN uses "St")
    const noPeriods = normalized.replace(/\./g, '');
    if (teamLogos[noPeriods]) return teamLogos[noPeriods];
    
    // Try with "State" instead of "St." / "St"
    const withState = noPeriods.replace(/\bst\b/g, 'state');
    if (teamLogos[withState]) return teamLogos[withState];
    
    // Try without common suffixes
    const words = noPeriods.split(' ');
    if (words.length > 1) {
      // Try progressively removing words from the end (to strip mascots)
      // e.g., "duke blue devils" -> "duke blue" -> "duke"
      for (let i = words.length - 1; i >= 1; i--) {
        const partial = words.slice(0, i).join(' ');
        if (teamLogos[partial]) return teamLogos[partial];
        
        // Also try with "state" substitution
        const partialWithState = partial.replace(/\bst\b/g, 'state');
        if (teamLogos[partialWithState]) return teamLogos[partialWithState];
      }
      
      // Try just first word for non-state schools
      // But NOT for state schools (would match Ohio instead of Ohio St.)
      if (!words.includes('st') && !words.includes('state')) {
        if (teamLogos[words[0]]) return teamLogos[words[0]];
      }
      
      // Try first two words
      const twoWords = words.slice(0, 2).join(' ');
      if (teamLogos[twoWords]) return teamLogos[twoWords];
    }
    
    return null;
  };

  const loadRatings = async () => {
    try {
      const response = await fetch('/api/ratings/calculate');
      const data: CalculateResponse = await response.json();
      
      if (data.success && data.data) {
        setSnapshot(data.data);
        setSyncRange(data.syncRange || null);
        if (data.config) {
          setHca(data.config.hca);
          setClosingSource(data.config.closingSource);
        }
      }
    } catch {
      console.log('No cached ratings available');
    }
  };

  const loadMatchingLogs = async () => {
    setLogsLoading(true);
    try {
      // Load matching logs and non-D1 games in parallel
      const [logsResponse, nonD1Response] = await Promise.all([
        fetch('/api/ratings/calculate?logs=true'),
        fetch('/api/ratings/non-d1'),
      ]);
      
      const logsData: CalculateResponse = await logsResponse.json();
      const nonD1Data = await nonD1Response.json();
      
      if (logsData.success) {
        setMatchingLogs(logsData.matchingLogs || []);
        setMatchingStats(logsData.matchingStats || null);
      }
      
      if (nonD1Data.success) {
        setNonD1GameIds(new Set(nonD1Data.gameIds || []));
      }
    } catch (err) {
      console.error('Failed to load matching logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadOverrides = async () => {
    setOverridesLoading(true);
    try {
      const response = await fetch('/api/ratings/overrides');
      const data = await response.json();
      
      if (data.success) {
        setOverrides(data.overrides || []);
        setKenpomTeams(data.kenpomTeams || []);
        setOddsApiTeams(data.oddsApiTeams || []);
        setTorvikTeams(data.torvikTeams || []);
      }
    } catch (err) {
      console.error('Failed to load overrides:', err);
    } finally {
      setOverridesLoading(false);
    }
  };

  const loadSchedule = async () => {
    setScheduleLoading(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const cacheBuster = Date.now();
      
      // Use existing btGames if already loaded (from BT tab), otherwise fetch
      let btGamesRaw: Array<{
        id?: number;
        gameDate: string;
        gameTime?: string;
        homeTeam: string;
        awayTeam: string;
        predictedSpread?: number;
        predictedTotal?: number;
        homeWinProb?: number;
        awayWinProb?: number;
      }> = [];
      
      if (btGames.length > 0) {
        // Convert from BTGame format to the format we need
        btGamesRaw = btGames.map(g => ({
          gameDate: g.date,
          gameTime: g.time,
          homeTeam: g.home_team,
          awayTeam: g.away_team,
          predictedSpread: g.predicted_spread,
          predictedTotal: g.predicted_total,
          homeWinProb: g.home_win_prob,
          awayWinProb: g.away_win_prob,
        }));
        console.log(`Using existing ${btGamesRaw.length} BT games from state`);
      } else {
        // Fetch from API
        const btRes = await fetch('/api/ratings/bt-schedule');
        const btData = await btRes.json();
        btGamesRaw = btData.success ? (btData.data || []) : [];
        console.log(`Fetched ${btGamesRaw.length} BT games from API`);
      }
      
      // Load overrides first (needed for team name mapping)
      let currentOverrides = overrides;
      if (overrides.length === 0) {
        try {
          const overridesRes = await fetch('/api/ratings/overrides');
          const overridesData = await overridesRes.json();
          if (overridesData.success) {
            currentOverrides = overridesData.overrides || [];
            setOverrides(currentOverrides);
          }
        } catch (err) {
          console.error('Failed to load overrides:', err);
        }
      }
      
      // Helper to get date label for a game
      const getDateLabel = (gameDate: string): { label: string; isToday: boolean; isTomorrow: boolean; isDay2: boolean; isDay3: boolean } => {
        const now = new Date();
        const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        
        const formatDate = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        const todayStr = formatDate(eastern);
        
        const tomorrow = new Date(eastern);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = formatDate(tomorrow);
        
        const day2 = new Date(eastern);
        day2.setDate(day2.getDate() + 2);
        const day2Str = formatDate(day2);
        
        const day3 = new Date(eastern);
        day3.setDate(day3.getDate() + 3);
        const day3Str = formatDate(day3);
        
        if (gameDate === todayStr) {
          return { label: 'Today', isToday: true, isTomorrow: false, isDay2: false, isDay3: false };
        } else if (gameDate === tomorrowStr) {
          return { label: 'Tomorrow', isToday: false, isTomorrow: true, isDay2: false, isDay3: false };
        } else if (gameDate === day2Str) {
          const [year, month, day] = gameDate.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return { label, isToday: false, isTomorrow: false, isDay2: true, isDay3: false };
        } else if (gameDate === day3Str) {
          const [year, month, day] = gameDate.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return { label, isToday: false, isTomorrow: false, isDay2: false, isDay3: true };
        } else {
          const [year, month, day] = gameDate.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return { label, isToday: false, isTomorrow: false, isDay2: false, isDay3: false };
        }
      };
      
      // Build initial combined games from BT data (no odds yet)
      const initialCombinedGames: CombinedScheduleGame[] = btGamesRaw.map((bt) => {
        const dateInfo = getDateLabel(bt.gameDate);
        
        return {
          id: bt.id?.toString() || `${bt.gameDate}-${bt.awayTeam}-${bt.homeTeam}`,
          gameDate: bt.gameDate,
          gameTime: bt.gameTime || '',
          homeTeam: bt.homeTeam,
          awayTeam: bt.awayTeam,
          btSpread: bt.predictedSpread ?? null,
          btTotal: bt.predictedTotal ?? null,
          homeWinProb: bt.homeWinProb ?? null,
          awayWinProb: bt.awayWinProb ?? null,
          // No odds yet
          oddsGameId: null,
          spread: null,
          openingSpread: null,
          total: null,
          spreadBookmaker: null,
          hasStarted: false,
          isFrozen: false,
          // Date info
          isToday: dateInfo.isToday,
          isTomorrow: dateInfo.isTomorrow,
          isDay2: dateInfo.isDay2,
          isDay3: dateInfo.isDay3,
          dateLabel: dateInfo.label,
        };
      });
      
      // Sort by date then time
      initialCombinedGames.sort((a, b) => {
        const dateCompare = a.gameDate.localeCompare(b.gameDate);
        if (dateCompare !== 0) return dateCompare;
        return (a.gameTime || '').localeCompare(b.gameTime || '');
      });
      
      // Show BT games immediately (without odds)
      setCombinedScheduleGames(initialCombinedGames);
      setScheduleLoading(false);
      
      console.log(`Displayed ${initialCombinedGames.length} BT games, now fetching odds...`);
      
      // Now fetch odds data in the background and merge when ready
      try {
        const oddsRes = await fetch(`/api/ratings/schedule?timezone=${encodeURIComponent(timezone)}&_t=${cacheBuster}`);
        const oddsData = await oddsRes.json();
        
        if (oddsData.success && oddsData.games) {
          const oddsGames: ScheduleGame[] = oddsData.games;
          setScheduleGames(oddsGames);
          
          // Build lookup maps for matching
          const torvikToOddsApi: Record<string, string> = {};
          for (const override of currentOverrides) {
            if (override.torvikName && override.oddsApiName) {
              torvikToOddsApi[override.torvikName.toLowerCase()] = override.oddsApiName.toLowerCase();
            }
          }
          
          // Helper to normalize team names for fuzzy matching
          const normalizeForMatch = (name: string): string => {
            return name.toLowerCase()
              .replace(/\s+(bulldogs|wildcats|tigers|bears|eagles|hawks|cardinals|blue devils|hoosiers|boilermakers|wolverines|buckeyes|spartans|badgers|gophers|hawkeyes|fighting irish|crimson tide|volunteers|razorbacks|rebels|aggies|longhorns|sooners|cowboys|horned frogs|jayhawks|cyclones|mountaineers|red raiders|golden eagles|panthers|cougars|huskies|ducks|beavers|bruins|trojans|sun devils|utes|buffaloes|aztecs|wolf pack|lobos|owls|mean green|roadrunners|miners|mustangs|golden hurricane|shockers|bearcats|red storm|pirates|blue demons|billikens|musketeers|explorers|gaels|zags|gonzaga bulldogs|toreros|matadors|anteaters|gauchos|highlanders|tritons|49ers|beach|titans|broncos|waves|pilots|lions|leopards|big green|crimson|elis|quakers|orange|hokies|cavaliers|tar heels|wolfpack|demon deacons|yellow jackets|seminoles|hurricanes|fighting illini|cornhuskers|nittany lions|terrapins|scarlet knights|hoyas|friars|bluejays|johnnies|red foxes|rams|bonnies|dukes|flyers|colonials|spiders|phoenix|redhawks|penguins|golden flashes|rockets|chippewas|bulls|thundering herd|bobcats|zips|falcons)$/i, '')
              .replace(/\(.*?\)/g, '')
              .replace(/st\./g, 'state')
              .replace(/[^a-z0-9\s]/g, '')
              .replace(/\s+/g, ' ')
              .trim();
          };
          
          // Function to find matching Odds API game
          const findOddsMatch = (btHome: string, btAway: string): ScheduleGame | null => {
            const oddsHomeOverride = torvikToOddsApi[btHome.toLowerCase()];
            const oddsAwayOverride = torvikToOddsApi[btAway.toLowerCase()];
            
            for (const oddsGame of oddsGames) {
              const oddsHomeLower = oddsGame.homeTeam.toLowerCase();
              const oddsAwayLower = oddsGame.awayTeam.toLowerCase();
              
              if (oddsHomeOverride && oddsAwayOverride) {
                if (oddsHomeLower.includes(oddsHomeOverride) || oddsHomeOverride.includes(oddsHomeLower)) {
                  if (oddsAwayLower.includes(oddsAwayOverride) || oddsAwayOverride.includes(oddsAwayLower)) {
                    return oddsGame;
                  }
                }
              }
              
              const btHomeNorm = normalizeForMatch(btHome);
              const btAwayNorm = normalizeForMatch(btAway);
              const oddsHomeNorm = normalizeForMatch(oddsGame.homeTeam);
              const oddsAwayNorm = normalizeForMatch(oddsGame.awayTeam);
              
              const homeMatch = btHomeNorm === oddsHomeNorm || 
                                btHomeNorm.includes(oddsHomeNorm) || 
                                oddsHomeNorm.includes(btHomeNorm);
              const awayMatch = btAwayNorm === oddsAwayNorm || 
                                btAwayNorm.includes(oddsAwayNorm) || 
                                oddsAwayNorm.includes(btAwayNorm);
              
              if (homeMatch && awayMatch) {
                return oddsGame;
              }
            }
            
            return null;
          };
          
          // Merge odds into combined games
          let enrichedGames = initialCombinedGames.map(game => {
            const oddsMatch = findOddsMatch(game.homeTeam, game.awayTeam);
            
            if (oddsMatch) {
              return {
                ...game,
                oddsGameId: oddsMatch.id,
                spread: oddsMatch.spread,
                openingSpread: oddsMatch.openingSpread,
                total: oddsMatch.total,
                spreadBookmaker: oddsMatch.spreadBookmaker,
                hasStarted: oddsMatch.hasStarted,
                isFrozen: oddsMatch.isFrozen,
              };
            }
            
            return game;
          });
          
          const matchedCount = enrichedGames.filter(g => g.oddsGameId !== null).length;
          console.log(`Enriched with live odds: ${matchedCount}/${enrichedGames.length} games matched`);
          
          // For games that didn't match (likely finished), try to get closing lines from cache
          const unmatchedTodayGames = enrichedGames.filter(g => g.isToday && g.oddsGameId === null);
          
          if (unmatchedTodayGames.length > 0) {
            console.log(`Fetching closing lines for ${unmatchedTodayGames.length} unmatched today games...`);
            console.log('Unmatched games:', unmatchedTodayGames.map(g => `${g.awayTeam} @ ${g.homeTeam}`));
            
            try {
              // Get today's date in YYYY-MM-DD format
              const now = new Date();
              const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
              const todayStr = `${eastern.getFullYear()}-${String(eastern.getMonth() + 1).padStart(2, '0')}-${String(eastern.getDate()).padStart(2, '0')}`;
              
              const closingRes = await fetch(`/api/ratings/closing-lines?date=${todayStr}`);
              const closingData = await closingRes.json();
              
              if (closingData.success && closingData.data) {
                const closingLines = closingData.data;
                console.log(`Got ${closingLines.length} closing lines`);
                
                // Use the SAME matching logic as live odds - closing lines have Odds API names
                const findClosingMatch = (btHome: string, btAway: string) => {
                  const oddsHomeOverride = torvikToOddsApi[btHome.toLowerCase()];
                  const oddsAwayOverride = torvikToOddsApi[btAway.toLowerCase()];
                  
                  for (const cl of closingLines) {
                    const clHomeLower = cl.homeTeam.toLowerCase();
                    const clAwayLower = cl.awayTeam.toLowerCase();
                    
                    // Try override match first (same as live odds matching)
                    if (oddsHomeOverride && oddsAwayOverride) {
                      if (clHomeLower.includes(oddsHomeOverride) || oddsHomeOverride.includes(clHomeLower)) {
                        if (clAwayLower.includes(oddsAwayOverride) || oddsAwayOverride.includes(clAwayLower)) {
                          return cl;
                        }
                      }
                    }
                    
                    // Try normalized fuzzy match (same as live odds matching)
                    const btHomeNorm = normalizeForMatch(btHome);
                    const btAwayNorm = normalizeForMatch(btAway);
                    const clHomeNorm = normalizeForMatch(cl.homeTeam);
                    const clAwayNorm = normalizeForMatch(cl.awayTeam);
                    
                    const homeMatch = btHomeNorm === clHomeNorm || 
                                      btHomeNorm.includes(clHomeNorm) || 
                                      clHomeNorm.includes(btHomeNorm);
                    const awayMatch = btAwayNorm === clAwayNorm || 
                                      btAwayNorm.includes(clAwayNorm) || 
                                      clAwayNorm.includes(btAwayNorm);
                    
                    if (homeMatch && awayMatch) {
                      return cl;
                    }
                  }
                  
                  return null;
                };
                
                // Update unmatched games with closing lines
                let closingMatchCount = 0;
                enrichedGames = enrichedGames.map(game => {
                  if (game.isToday && game.oddsGameId === null) {
                    const closingMatch = findClosingMatch(game.homeTeam, game.awayTeam);
                    
                    if (closingMatch) {
                      closingMatchCount++;
                      return {
                        ...game,
                        oddsGameId: closingMatch.gameId,
                        spread: closingMatch.closingSpread,
                        openingSpread: closingMatch.openingSpread || closingMatch.closingSpread,
                        total: closingMatch.total,
                        spreadBookmaker: closingMatch.closingSource,
                        hasStarted: true,
                        isFrozen: true,
                      };
                    }
                  }
                  return game;
                });
                
                console.log(`Matched ${closingMatchCount} of ${unmatchedTodayGames.length} games with closing lines`);
                
                // Log any that still didn't match
                const stillUnmatched = enrichedGames.filter(g => g.isToday && g.oddsGameId === null);
                if (stillUnmatched.length > 0) {
                  console.log('Still unmatched after closing lines:', stillUnmatched.map(g => `${g.awayTeam} @ ${g.homeTeam}`));
                }
              }
            } catch (closingErr) {
              console.error('Failed to fetch closing lines:', closingErr);
            }
          }
          
          setCombinedScheduleGames(enrichedGames);
        }
      } catch (err) {
        console.error('Failed to load odds data:', err);
        // BT games are already displayed, so this is non-fatal
      }
      
    } catch (err) {
      console.error('Failed to load schedule:', err);
      setScheduleLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/ratings/schedule/history?limit=250');
      const data = await response.json();
      
      if (data.success) {
        // Map from API response to HistoryGame format
        const games: HistoryGame[] = (data.games || []).map((g: {
          id: string;
          commenceTime: string;
          homeTeam: string;
          awayTeam: string;
          projectedSpread: number | null;
          openingSpread: number | null;
          spread: number | null;
          spreadBookmaker: string | null;
        }) => ({
          id: g.id,
          gameDate: g.commenceTime,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          projectedSpread: g.projectedSpread,
          openingSpread: g.openingSpread,
          closingSpread: g.spread,
          closingSource: g.spreadBookmaker,
          difference: g.projectedSpread !== null && g.spread !== null 
            ? Math.round((g.spread - g.projectedSpread) * 100) / 100
            : null,
        }));
        setHistoryGames(games);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Helper to normalize team names for matching
  const normalizeTeamName = (name: string): string => {
    // Common mascot/suffix removals
    const mascotsAndSuffixes = [
      'hoosiers', 'boilermakers', 'wildcats', 'commodores', 'crimson tide',
      'tigers', 'cavaliers', 'fighting irish', 'flyers', 'rams', 'huskies',
      'friars', 'flames', 'sycamores', 'cardinals', 'billikens', 'revolutionaries',
      'hokies', 'yellow jackets', 'mountaineers', 'golden eagles', 'bluejays',
      'spartans', 'broncos', 'ramblers', 'hawks', 'redhawks', 'minutemen',
      'bulldogs', 'bears', 'eagles', 'lions', 'panthers', 'devils', 'blue devils',
      'tar heels', 'wolfpack', 'seminoles', 'hurricanes', 'orange', 'cardinal',
      'bruins', 'trojans', 'ducks', 'beavers', 'cougars', 'utes', 'buffaloes',
      'jayhawks', 'cyclones', 'longhorns', 'sooners', 'cowboys', 'horned frogs',
      'red raiders', 'aggies', 'razorbacks', 'rebels', 'volunteers', 'gamecocks',
      'gators', 'dawgs', 'bulldogs', 'yellow jackets', 'demon deacons', 'hokies',
      'owls', 'pirates', 'gaels', 'zags', 'gonzaga bulldogs', 'shockers',
      'musketeers', 'bearcats', 'explorers', 'bonnies', 'dukes', 'colonials',
      'spiders', 'hatters', 'mean green', 'roadrunners', 'miners', 'aztecs',
      'falcons', 'rockets', 'chippewas', 'huskies', 'bulls', 'thundering herd',
      'bobcats', 'redhawks', 'golden flashes', 'zips', 'penguins'
    ];
    
    let normalized = name.toLowerCase();
    
    // Remove mascots
    for (const mascot of mascotsAndSuffixes) {
      normalized = normalized.replace(mascot, '');
    }
    
    return normalized
      .replace(/[^a-z0-9\s]/g, '') // Remove special chars but keep spaces initially
      .replace(/\s+/g, ' ')        // Normalize spaces
      .trim()
      .replace(/\s/g, '')          // Now remove spaces
      .replace(/state/g, 'st')
      .replace(/university/g, '')
      .replace(/college/g, '')
      .replace(/northern/g, 'n')
      .replace(/southern/g, 's')
      .replace(/eastern/g, 'e')
      .replace(/western/g, 'w');
  };

  // Load Barttorvik data
  const loadBarttorvik = async () => {
    setBtLoading(true);
    setBtError(null);
    
    try {
      // Load BT data, market odds, and team overrides
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const cacheBuster = Date.now();
      
      const [scheduleRes, ratingsRes, oddsRes, overridesRes] = await Promise.all([
        fetch('/api/ratings/barttorvik?type=schedule'),
        fetch('/api/ratings/barttorvik?type=ratings'),
        fetch(`/api/ratings/schedule?timezone=${encodeURIComponent(timezone)}&_t=${cacheBuster}`),
        fetch('/api/ratings/overrides')
      ]);
      
      const scheduleData = await scheduleRes.json();
      const ratingsData = await ratingsRes.json();
      const oddsData = await oddsRes.json();
      const overridesData = await overridesRes.json();
      
      // Build lookup maps from overrides
      // torvik_name -> odds_api_name mapping
      const torvikToOddsApi: Record<string, string> = {};
      // Also build reverse: odds_api_name -> normalized for matching
      const oddsApiNormalized: Record<string, string> = {};
      
      if (overridesData.success && overridesData.overrides) {
        for (const override of overridesData.overrides) {
          if (override.torvik_name && override.odds_api_name) {
            torvikToOddsApi[override.torvik_name.toLowerCase()] = override.odds_api_name;
          }
          if (override.odds_api_name) {
            oddsApiNormalized[override.odds_api_name.toLowerCase()] = normalizeTeamName(override.odds_api_name);
          }
        }
      }
      
      // Get market odds from the schedule
      const marketGames = oddsData.success ? (oddsData.games || []) : scheduleGames;
      
      // Also update scheduleGames if we got new data
      if (oddsData.success && oddsData.games) {
        setScheduleGames(oddsData.games);
      }
      
      if (scheduleData.success) {
        const btGamesData = scheduleData.data || [];
        
        // Match BT games with market lines
        const matchedGames = btGamesData.map((btGame: BTGame) => {
          // First check if there's an override for this Torvik name
          const homeOddsApiName = torvikToOddsApi[btGame.home_team.toLowerCase()];
          const awayOddsApiName = torvikToOddsApi[btGame.away_team.toLowerCase()];
          
          // Normalize names (use override if available, otherwise normalize Torvik name)
          const btHomeNorm = homeOddsApiName 
            ? normalizeTeamName(homeOddsApiName) 
            : normalizeTeamName(btGame.home_team);
          const btAwayNorm = awayOddsApiName 
            ? normalizeTeamName(awayOddsApiName) 
            : normalizeTeamName(btGame.away_team);
          
          const matchedMarket = marketGames.find((market: ScheduleGame) => {
            const marketHomeNorm = normalizeTeamName(market.homeTeam);
            const marketAwayNorm = normalizeTeamName(market.awayTeam);
            
            // Direct match via override
            if (homeOddsApiName && market.homeTeam.toLowerCase().includes(homeOddsApiName.toLowerCase())) {
              if (awayOddsApiName && market.awayTeam.toLowerCase().includes(awayOddsApiName.toLowerCase())) {
                return true;
              }
            }
            
            // Match if both teams match (accounting for name variations)
            const homeMatch = btHomeNorm.includes(marketHomeNorm) || 
                             marketHomeNorm.includes(btHomeNorm) ||
                             btHomeNorm === marketHomeNorm;
            const awayMatch = btAwayNorm.includes(marketAwayNorm) || 
                             marketAwayNorm.includes(btAwayNorm) ||
                             btAwayNorm === marketAwayNorm;
            
            return homeMatch && awayMatch;
          });
          
          if (matchedMarket) {
            return {
              ...btGame,
              spread: matchedMarket.spread,
              total: matchedMarket.total,
            };
          }
          
          return btGame;
        });
        
        setBtGames(matchedGames);
        
        // Count matches for debugging
        const matchCount = matchedGames.filter((g: BTGame) => g.spread != null).length;
        console.log(`Matched ${matchCount}/${matchedGames.length} BT games with market lines`);
      }
      
      if (ratingsData.success) {
        setBtRatings(ratingsData.data || []);
      }
      
      // Show note if using mock data
      if (scheduleData.note || ratingsData.note) {
        setBtError(scheduleData.note || ratingsData.note);
      }
    } catch (err) {
      console.error('Failed to load Barttorvik data:', err);
      setBtError('Failed to load Barttorvik data');
    } finally {
      setBtLoading(false);
    }
  };

  // Sync Torvik team names to database (one-time operation)
  const syncTorvikTeams = async () => {
    setBtLoading(true);
    setBtError(null);
    
    try {
      const response = await fetch('/api/ratings/barttorvik?type=ratings&syncTeams=true&refresh=true');
      const data = await response.json();
      
      if (data.success) {
        setBtRatings(data.data || []);
        setSuccessMessage(`Synced ${data.teamsSynced || 0} Torvik team names to database`);
        setTimeout(() => setSuccessMessage(null), 5000);
        
        // Reload overrides to get the new team list
        loadOverrides();
      } else {
        setBtError(data.error || 'Failed to sync teams');
      }
    } catch (err) {
      console.error('Failed to sync Torvik teams:', err);
      setBtError('Failed to sync Torvik teams');
    } finally {
      setBtLoading(false);
    }
  };

  const markAsNonD1 = async (log: MatchingLog) => {
    try {
      const response = await fetch('/api/ratings/non-d1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: log.gameId,
          espnHome: log.espnHome,
          espnAway: log.espnAway,
          gameDate: log.gameDate,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Add to local set immediately for UI update
        setNonD1GameIds(prev => new Set([...prev, log.gameId]));
        setSuccessMessage(`Marked as non-D1: ${log.espnHome} vs ${log.espnAway}`);
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        setError(data.error || 'Failed to mark as non-D1');
      }
    } catch (err) {
      console.error('Failed to mark as non-D1:', err);
      setError('Failed to mark as non-D1');
    }
  };

  // Load data when switching tabs
  useEffect(() => {
    if (isLocalhost && activeTab === 'matching' && matchingLogs.length === 0) {
      loadMatchingLogs();
    }
    if (isLocalhost && activeTab === 'overrides' && overrides.length === 0) {
      loadOverrides();
    }
    if (activeTab === 'schedule') {
      // Load combined schedule (BT primary + Odds API enrichment)
      if (combinedScheduleGames.length === 0) {
        loadSchedule();
      }
      // Also load overrides for team name mapping if not already loaded
      if (overrides.length === 0) {
        loadOverrides();
      }
    }
    if (activeTab === 'history' && historyGames.length === 0) {
      loadHistory();
    }
    if (isLocalhost && activeTab === 'barttorvik' && btGames.length === 0 && btRatings.length === 0) {
      loadBarttorvik();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isLocalhost]);
  
  const calculateRatings = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const requestBody: Record<string, unknown> = {
        hca,
        closingSource,
        maxGames,
      };
      
      // Add date range if specified
      if (syncStartDate) requestBody.startDate = syncStartDate;
      if (syncEndDate) requestBody.endDate = syncEndDate;
      
      const response = await fetch('/api/ratings/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      const data: CalculateResponse = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Failed to calculate ratings');
        return;
      }
      
      setSnapshot(data.data || null);
      setSyncRange(data.syncRange || null);
      
      // Reload matching logs after calculation
      await loadMatchingLogs();
      
      // Show success summary
      const newGames = data.summary?.newGamesProcessed || data.summary?.gamesProcessed || 0;
      const skipped = data.summary?.gamesSkipped || 0;
      const dateRangeText = syncStartDate || syncEndDate 
        ? ` (${syncStartDate || 'start'} to ${syncEndDate || 'today'})`
        : '';
      setSuccessMessage(`Sync complete${dateRangeText}! ${newGames} games processed, ${skipped} skipped.`);
      setTimeout(() => setSuccessMessage(null), 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const recalculateRatings = async () => {
    if (!confirm('This will reset all team ratings to initial KenPom values and replay all game adjustments. Continue?')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const response = await fetch('/api/ratings/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate',
          hca,
          season: 2026,
        }),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        setError(data.error || 'Failed to recalculate ratings');
        return;
      }
      
      // Reload ratings
      await loadRatings();
      
      setSuccessMessage(`Recalculation complete! ${data.gamesProcessed} games replayed.`);
      setTimeout(() => setSuccessMessage(null), 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Override management
  const openAddOverrideModal = async (sourceName?: string, oddsApiName?: string) => {
    setEditingOverride(null);
    setNewOverride({ sourceName: sourceName || '', kenpomName: '', espnName: '', oddsApiName: oddsApiName || '', torvikName: '', notes: '' });
    setKenpomSearch('');
    setShowKenpomDropdown(false);
    setOddsApiSearch('');
    setShowOddsApiDropdown(false);
    setOverrideError(null);
    setShowOverrideModal(true);
    
    // Only fetch if teams aren't already loaded (they get loaded when Overrides tab opens)
    if (kenpomTeams.length === 0 || oddsApiTeams.length === 0) {
      try {
        const response = await fetch('/api/ratings/overrides');
        const data = await response.json();
        if (data.success) {
          if (data.kenpomTeams) setKenpomTeams(data.kenpomTeams);
          if (data.oddsApiTeams) setOddsApiTeams(data.oddsApiTeams);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      }
    }
  };

  const saveOverride = async () => {
    if (!newOverride.sourceName || !newOverride.kenpomName) {
      setOverrideError('Both source name and KenPom name are required');
      return;
    }

    try {
      const url = '/api/ratings/overrides';
      const method = editingOverride ? 'PUT' : 'POST';
      const body = editingOverride 
        ? { id: editingOverride.id, ...newOverride }
        : { ...newOverride, source: 'manual' };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!data.success) {
        setOverrideError(data.error || 'Failed to save override');
        return;
      }

      setShowOverrideModal(false);
      
      // Show success message with games processed info
      if (data.gamesProcessed > 0) {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}". ${data.gamesProcessed} game(s) processed automatically!`);
      } else if (data.gamesUpdated > 0) {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}". ${data.gamesUpdated} log(s) updated.`);
      } else {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}".`);
      }
      setTimeout(() => setSuccessMessage(null), 10000);
      
      // Refresh all data
      await Promise.all([
        loadOverrides(),
        loadMatchingLogs(),
        loadRatings(),
      ]);
      
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const deleteOverride = async (id: number) => {
    if (!confirm('Are you sure you want to delete this override?')) return;

    try {
      const response = await fetch(`/api/ratings/overrides?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        loadOverrides();
      }
    } catch (err) {
      console.error('Failed to delete override:', err);
    }
  };

  // Start inline editing
  const startInlineEdit = async (override: TeamOverride) => {
    setInlineEditId(override.id!);
    setInlineOddsApiSearch(override.oddsApiName || '');
    setShowInlineOddsApiDropdown(false);
    setInlineTorvikSearch(override.torvikName || '');
    setShowInlineTorvikDropdown(false);
    
    // Load team lists if not already loaded
    if (oddsApiTeams.length === 0 || torvikTeams.length === 0) {
      try {
        const response = await fetch('/api/ratings/overrides');
        const data = await response.json();
        if (data.success) {
          if (data.oddsApiTeams) setOddsApiTeams(data.oddsApiTeams);
          if (data.torvikTeams) setTorvikTeams(data.torvikTeams);
        }
      } catch (err) {
        console.error('Failed to load teams:', err);
      }
    }
    
    // Set ref values after render
    setTimeout(() => {
      if (inlineSourceNameRef.current) inlineSourceNameRef.current.value = override.sourceName;
      if (inlineKenpomNameRef.current) inlineKenpomNameRef.current.value = override.kenpomName;
      if (inlineEspnNameRef.current) inlineEspnNameRef.current.value = override.espnName || '';
      if (inlineOddsApiRef.current) inlineOddsApiRef.current.value = override.oddsApiName || '';
      if (inlineTorvikRef.current) inlineTorvikRef.current.value = override.torvikName || '';
      if (inlineNotesRef.current) inlineNotesRef.current.value = override.notes || '';
    }, 0);
  };

  // Cancel inline editing
  const cancelInlineEdit = () => {
    setInlineEditId(null);
    setInlineOddsApiSearch('');
    setShowInlineOddsApiDropdown(false);
    setInlineTorvikSearch('');
    setShowInlineTorvikDropdown(false);
  };

  // Save inline edit
  const saveInlineEdit = async () => {
    if (!inlineEditId) return;
    
    const sourceName = inlineSourceNameRef.current?.value || '';
    const kenpomName = inlineKenpomNameRef.current?.value || '';
    
    if (!sourceName || !kenpomName) return;

    const editValues = {
      sourceName,
      kenpomName,
      espnName: inlineEspnNameRef.current?.value || '',
      oddsApiName: inlineOddsApiRef.current?.value || '',
      torvikName: inlineTorvikRef.current?.value || '',
      notes: inlineNotesRef.current?.value || '',
    };

    try {
      const response = await fetch('/api/ratings/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: inlineEditId,
          ...editValues,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Update local state immediately
        setOverrides(prev => prev.map(o => 
          o.id === inlineEditId 
            ? { ...o, ...editValues } as TeamOverride
            : o
        ));
        setInlineEditId(null);
        setInlineOddsApiSearch('');
        setShowInlineOddsApiDropdown(false);
        setInlineTorvikSearch('');
        setShowInlineTorvikDropdown(false);
      }
    } catch (err) {
      console.error('Failed to save inline edit:', err);
    }
  };

  // Filtered Odds API teams for inline edit dropdown
  const filteredInlineOddsApiTeams = useMemo(() => {
    if (!debouncedInlineOddsApiSearch || debouncedInlineOddsApiSearch.length < 1) return [];
    const search = debouncedInlineOddsApiSearch.toLowerCase().trim();
    return oddsApiTeams
      .filter(t => t.toLowerCase().includes(search))
      .slice(0, 8);
  }, [debouncedInlineOddsApiSearch, oddsApiTeams]);

  // Filtered Torvik teams for inline edit dropdown
  const filteredInlineTorvikTeams = useMemo(() => {
    if (!debouncedInlineTorvikSearch || debouncedInlineTorvikSearch.length < 1) return [];
    const search = debouncedInlineTorvikSearch.toLowerCase().trim();
    return torvikTeams
      .filter(t => t.toLowerCase().includes(search))
      .slice(0, 8);
  }, [debouncedInlineTorvikSearch, torvikTeams]);

  // Filtered KenPom teams for autocomplete
  const filteredKenpomTeams = useMemo(() => {
    if (!debouncedKenpomSearch || debouncedKenpomSearch.length < 1) return [];
    const search = debouncedKenpomSearch.toLowerCase().trim();
    
    // Prioritize teams that START with the search term
    const startsWithMatches = kenpomTeams.filter(t => 
      t.toLowerCase().startsWith(search)
    );
    
    // Then teams that CONTAIN the search term (but don't start with it)
    const containsMatches = kenpomTeams.filter(t => 
      !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search)
    );
    
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [kenpomTeams, debouncedKenpomSearch]);

  // Filtered Odds API teams for autocomplete
  const filteredOddsApiTeams = useMemo(() => {
    if (!debouncedOddsApiSearch || debouncedOddsApiSearch.length < 1) return [];
    const search = debouncedOddsApiSearch.toLowerCase().trim();
    
    // Prioritize teams that START with the search term
    const startsWithMatches = oddsApiTeams.filter(t => 
      t.toLowerCase().startsWith(search)
    );
    
    // Then teams that CONTAIN the search term (but don't start with it)
    const containsMatches = oddsApiTeams.filter(t => 
      !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search)
    );
    
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [oddsApiTeams, debouncedOddsApiSearch]);

  // Get sorted team list for matchups dropdowns
  const sortedTeams = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.ratings].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [snapshot]);

  // Filter teams for home dropdown
  const filteredHomeTeams = useMemo(() => {
    if (!homeTeamSearch) return sortedTeams.slice(0, 20);
    const search = homeTeamSearch.toLowerCase();
    return sortedTeams.filter(t => 
      t.teamName.toLowerCase().includes(search)
    ).slice(0, 20);
  }, [sortedTeams, homeTeamSearch]);

  // Filter teams for away dropdown
  const filteredAwayTeams = useMemo(() => {
    if (!awayTeamSearch) return sortedTeams.slice(0, 20);
    const search = awayTeamSearch.toLowerCase();
    return sortedTeams.filter(t => 
      t.teamName.toLowerCase().includes(search)
    ).slice(0, 20);
  }, [sortedTeams, awayTeamSearch]);

  // Calculate projected spread for matchup
  const matchupProjection = useMemo(() => {
    if (!snapshot || !homeTeam || !awayTeam) return null;
    
    const homeRating = snapshot.ratings.find(r => r.teamName === homeTeam);
    const awayRating = snapshot.ratings.find(r => r.teamName === awayTeam);
    
    if (!homeRating || !awayRating) return null;
    
    const hcaToApply = isNeutralSite ? 0 : hca;
    // Spread = -(HomeRating - AwayRating + HCA)
    // Negative spread means home team is favored
    const projectedSpread = -((homeRating.rating - awayRating.rating) + hcaToApply);
    
    return {
      homeTeam,
      awayTeam,
      homeRating: homeRating.rating,
      awayRating: awayRating.rating,
      homeConference: homeRating.conference,
      awayConference: awayRating.conference,
      projectedSpread,
      hcaApplied: hcaToApply,
      isNeutralSite,
    };
  }, [snapshot, homeTeam, awayTeam, isNeutralSite, hca]);

  // Swap home and away teams in matchup
  const swapTeams = () => {
    const tempTeam = homeTeam;
    const tempSearch = homeTeamSearch;
    setHomeTeam(awayTeam);
    setHomeTeamSearch(awayTeamSearch);
    setAwayTeam(tempTeam);
    setAwayTeamSearch(tempSearch);
  };

  // Build a map of team -> their adjustments
  const teamAdjustmentsMap = useMemo(() => {
    const map = new Map<string, GameAdjustment[]>();
    
    if (snapshot?.adjustments) {
      for (const adj of snapshot.adjustments) {
        if (!map.has(adj.homeTeam)) map.set(adj.homeTeam, []);
        map.get(adj.homeTeam)!.push(adj);
        if (!map.has(adj.awayTeam)) map.set(adj.awayTeam, []);
        map.get(adj.awayTeam)!.push(adj);
      }
      for (const [, games] of map) {
        games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    }
    return map;
  }, [snapshot?.adjustments]);

  // Build a map of team -> their initial rank (based on initialRating)
  const initialRankMap = useMemo(() => {
    const map = new Map<string, number>();
    if (snapshot?.ratings) {
      const sortedByInitial = [...snapshot.ratings].sort((a, b) => b.initialRating - a.initialRating);
      sortedByInitial.forEach((team, index) => {
        map.set(team.teamName, index + 1);
      });
    }
    return map;
  }, [snapshot?.ratings]);
  
  // Filter and sort ratings
  const filteredRatings = snapshot?.ratings
    .filter(r => 
      r.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.conference?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'rating': comparison = b.rating - a.rating; break;
        case 'name': comparison = a.teamName.localeCompare(b.teamName); break;
        case 'games': comparison = b.gamesProcessed - a.gamesProcessed; break;
        case 'change': comparison = (b.rating - b.initialRating) - (a.rating - a.initialRating); break;
        case 'initial': comparison = b.initialRating - a.initialRating; break;
      }
      return sortDir === 'desc' ? comparison : -comparison;
    }) || [];

  // Filter matching logs
  const filteredLogs = useMemo(() => {
    let logs = matchingLogs;
    
    // Filter out games marked as non-D1
    logs = logs.filter(l => !nonD1GameIds.has(l.gameId));
    
    if (logFilter === 'success') logs = logs.filter(l => l.status === 'success');
    else if (logFilter === 'failed') logs = logs.filter(l => l.status !== 'success');
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      logs = logs.filter(l => 
        l.espnHome.toLowerCase().includes(term) ||
        l.espnAway.toLowerCase().includes(term) ||
        l.matchedHome?.toLowerCase().includes(term) ||
        l.matchedAway?.toLowerCase().includes(term)
      );
    }
    return logs;
  }, [matchingLogs, logFilter, searchTerm, nonD1GameIds]);

  // Filter and sort history games
  const filteredHistoryGames = useMemo(() => {
    let games = [...historyGames];
    
    // Apply date filter
    if (historyStartDate) {
      const startDate = new Date(historyStartDate);
      games = games.filter(g => new Date(g.gameDate) >= startDate);
    }
    if (historyEndDate) {
      const endDate = new Date(historyEndDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end date
      games = games.filter(g => new Date(g.gameDate) <= endDate);
    }
    
    // Apply diff range filter (absolute value >= min)
    games = games.filter(g => {
      if (g.difference === null) return historyDiffMin === 0; // Only show null diff games when slider at 0
      return Math.abs(g.difference) >= historyDiffMin;
    });
    
    // Helper to calculate line movement for a game
    const getLineMovement = (game: HistoryGame): { away: number; home: number; toward: boolean | null } => {
      if (game.projectedSpread === null || game.openingSpread === null || game.closingSpread === null) {
        return { away: 0, home: 0, toward: null };
      }
      const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
      const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
      const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
      const toward = closeDiff < openDiff;
      
      // If spread decreased, home team got the movement; otherwise away team
      if (game.closingSpread < game.openingSpread) {
        return { away: 0, home: toward ? lineMovement : -lineMovement, toward };
      } else {
        return { away: toward ? lineMovement : -lineMovement, home: 0, toward };
      }
    };
    
    // Sort
    games.sort((a, b) => {
      let comparison = 0;
      
      switch (historySortField) {
        case 'date':
          comparison = new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
          break;
        case 'diff':
          const diffA = a.difference ?? 0;
          const diffB = b.difference ?? 0;
          comparison = diffA - diffB;
          break;
        case 'awayMovement':
          const awayA = getLineMovement(a);
          const awayB = getLineMovement(b);
          // Sort by intensity (absolute value of movement) with direction
          comparison = Math.abs(awayA.away) - Math.abs(awayB.away);
          if (comparison === 0 && awayA.toward !== awayB.toward) {
            comparison = awayA.toward ? 1 : -1; // Green (toward) sorts after red (against)
          }
          break;
        case 'homeMovement':
          const homeA = getLineMovement(a);
          const homeB = getLineMovement(b);
          comparison = Math.abs(homeA.home) - Math.abs(homeB.home);
          if (comparison === 0 && homeA.toward !== homeB.toward) {
            comparison = homeA.toward ? 1 : -1;
          }
          break;
      }
      
      return historySortDirection === 'asc' ? comparison : -comparison;
    });
    
    return games;
  }, [historyGames, historyStartDate, historyEndDate, historyDiffMin, historySortField, historySortDirection]);

  // Filter and sort schedule games (now using combinedScheduleGames as primary)
  const filteredScheduleGames = useMemo(() => {
    let games = combinedScheduleGames;
    
    // Apply date filter
    if (scheduleFilter === 'today') games = games.filter(g => g.isToday);
    else if (scheduleFilter === 'tomorrow') games = games.filter(g => g.isTomorrow);
    else if (scheduleFilter === 'day2') games = games.filter(g => g.isDay2);
    else if (scheduleFilter === 'day3') games = games.filter(g => g.isDay3);
    
    // Helper to find team rating
    const findTeamRating = (btTeamName: string) => {
      if (!snapshot?.ratings) return null;
      const searchLower = btTeamName.toLowerCase();
      
      const overrideByTorvik = overrides.find(o => o.torvikName?.toLowerCase() === searchLower);
      if (overrideByTorvik) {
        return snapshot.ratings.find(r => r.teamName === overrideByTorvik.kenpomName);
      }
      
      const overrideBySource = overrides.find(o => o.sourceName.toLowerCase() === searchLower);
      if (overrideBySource) {
        return snapshot.ratings.find(r => r.teamName === overrideBySource.kenpomName);
      }
      
      let rating = snapshot.ratings.find(r => r.teamName === btTeamName);
      if (rating) return rating;
      
      rating = snapshot.ratings.find(r => r.teamName.toLowerCase() === searchLower);
      if (rating) return rating;
      
      return null;
    };
    
    // Helper to compute movement score for a game
    // Positive = green (moving toward projection), Negative = red (moving away)
    // Magnitude = intensity of the color
    const computeMovementScore = (game: typeof games[0], forTeam: 'home' | 'away'): number | null => {
      const homeRating = findTeamRating(game.homeTeam);
      const awayRating = findTeamRating(game.awayTeam);
      
      if (!homeRating || !awayRating || game.openingSpread === null || game.spread === null) {
        return null;
      }
      
      if (game.openingSpread === game.spread) {
        return 0; // No movement
      }
      
      const projectedSpread = -((homeRating.rating - awayRating.rating) + hca);
      const openDiff = Math.abs(projectedSpread - game.openingSpread);
      const currentDiff = Math.abs(projectedSpread - game.spread);
      const lineMovement = Math.abs(game.spread - game.openingSpread);
      
      const movingToward = currentDiff < openDiff;
      
      // Determine which team the line is moving toward
      const movingTowardHome = game.spread < game.openingSpread;
      
      // For the requested team, compute score
      // Positive score = green highlight on this team
      // Negative score = red highlight on this team
      if (forTeam === 'home') {
        if (movingTowardHome) {
          // Line moving toward home team
          return movingToward ? lineMovement : -lineMovement;
        } else {
          // Line moving toward away team, so home has no highlight
          return 0;
        }
      } else {
        // away team
        if (!movingTowardHome) {
          // Line moving toward away team
          return movingToward ? lineMovement : -lineMovement;
        } else {
          // Line moving toward home team, so away has no highlight
          return 0;
        }
      }
    };
    
    // If sorting by delta or movement, compute values
    if (scheduleSortBy === 'delta' || scheduleSortBy === 'awayMovement' || scheduleSortBy === 'homeMovement') {
      const gamesWithValues = games.map(game => {
        const homeRating = findTeamRating(game.homeTeam);
        const awayRating = findTeamRating(game.awayTeam);
        
        let delta: number | null = null;
        if (homeRating && awayRating && game.spread !== null) {
          const projectedSpread = -((homeRating.rating - awayRating.rating) + hca);
          delta = Math.abs(projectedSpread - game.spread);
        }
        
        const awayMovement = computeMovementScore(game, 'away');
        const homeMovement = computeMovementScore(game, 'home');
        
        return { game, delta, awayMovement, homeMovement };
      });
      
      // Sort based on selected column
      gamesWithValues.sort((a, b) => {
        let aVal: number | null;
        let bVal: number | null;
        
        if (scheduleSortBy === 'delta') {
          aVal = a.delta;
          bVal = b.delta;
        } else if (scheduleSortBy === 'awayMovement') {
          aVal = a.awayMovement;
          bVal = b.awayMovement;
        } else {
          aVal = a.homeMovement;
          bVal = b.homeMovement;
        }
        
        // Nulls go to the end
        if (aVal === null && bVal === null) return 0;
        if (aVal === null) return 1;
        if (bVal === null) return -1;
        
        const comparison = aVal - bVal;
        return scheduleSortDir === 'desc' ? -comparison : comparison;
      });
      
      return gamesWithValues.map(g => g.game);
    }
    
    // Default: sort by date then time
    return [...games].sort((a, b) => {
      const dateCompare = a.gameDate.localeCompare(b.gameDate);
      if (dateCompare !== 0) return dateCompare;
      return (a.gameTime || '').localeCompare(b.gameTime || '');
    });
  }, [combinedScheduleGames, scheduleFilter, scheduleSortBy, scheduleSortDir, snapshot?.ratings, overrides, hca]);
  
  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortBy(column); setSortDir(column === 'name' ? 'asc' : 'desc'); }
  };

  const toggleTeamExpanded = (teamName: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamName)) newSet.delete(teamName);
      else newSet.add(teamName);
      return newSet;
    });
  };

  const getTeamGameDetails = (adj: GameAdjustment, teamName: string) => {
    const isHome = adj.homeTeam === teamName;
    return {
      opponent: isHome ? adj.awayTeam : adj.homeTeam,
      location: isHome ? 'vs' : '@',
      ratingBefore: isHome ? adj.homeRatingBefore : adj.awayRatingBefore,
      ratingAfter: isHome ? adj.homeRatingAfter : adj.awayRatingAfter,
      ratingChange: (isHome ? adj.homeRatingAfter : adj.awayRatingAfter) - (isHome ? adj.homeRatingBefore : adj.awayRatingBefore),
      isHome,
    };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'home_not_found': case 'away_not_found': return 'bg-orange-100 text-orange-800';
      case 'both_not_found': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success': return 'Matched';
      case 'home_not_found': return 'Home Not Found';
      case 'away_not_found': return 'Away Not Found';
      case 'both_not_found': return 'Both Not Found';
      case 'no_odds': return 'No Odds';
      case 'no_spread': return 'No Spread';
      default: return status;
    }
  };
  
  return (
    <div className="min-h-screen bg-blue-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Power Ratings</h1>
              <p className="text-sm text-gray-500">Market-adjusted NCAAB power ratings</p>
            </div>
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium">← Back to Odds</Link>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Initial Configuration - Display Only */}
        <div className="bg-white rounded-xl p-6 mb-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Initial Configuration</h2>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">2025-26 Season</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Initial Ratings Source</div>
              <div className="text-lg font-semibold text-gray-900">KenPom Final AdjEM</div>
              <div className="text-sm text-gray-600 mt-1">End of 2024-25 season (Apr 7, 2025)</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Home Court Advantage</div>
              <div className="text-lg font-semibold text-gray-900">{hca} points</div>
              <div className="text-sm text-gray-600 mt-1">Added to home team projection</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Closing Line Source</div>
              <div className="text-lg font-semibold text-gray-900">
                {CLOSING_LINE_SOURCES.find(s => s.value === closingSource)?.label || closingSource}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {CLOSING_LINE_SOURCES.find(s => s.value === closingSource)?.description}
              </div>
            </div>
          </div>
          
          {/* Current Status */}
          {(syncRange?.lastGameDate || snapshot) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {syncRange?.lastGameDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Synced through:</span>
                    <span className="font-semibold text-blue-600">
                      {new Date(syncRange.lastGameDate).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                )}
                {snapshot && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Teams:</span>
                      <span className="text-gray-700">{snapshot.ratings.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Games processed:</span>
                      <span className="text-gray-700">{snapshot.gamesProcessed}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Date Range Sync Panel - Only show on localhost */}
        {isLocalhost && (
        <div className="bg-white rounded-xl p-6 mb-6 border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Sync Games</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={syncStartDate}
                onChange={(e) => setSyncStartDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={syncEndDate}
                onChange={(e) => setSyncEndDate(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max Games</label>
              <input
                type="text"
                inputMode="numeric"
                value={maxGames}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setMaxGames(val === '' ? 0 : parseInt(val, 10));
                }}
                onBlur={() => {
                  if (maxGames < 1) setMaxGames(1);
                  else if (maxGames > 500) setMaxGames(500);
                  else if (!maxGames) setMaxGames(100);
                }}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={calculateRatings}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Syncing...' : 'Sync Games'}
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSyncStartDate('');
                  setSyncEndDate('');
                }}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Clear Dates
              </button>
            </div>
            <div className="flex items-end">
              <button
                onClick={recalculateRatings}
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                title="Reset ratings to initial values and replay all game adjustments"
              >
                {loading ? 'Processing...' : 'Recalculate'}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Leave dates empty to sync all unprocessed games. &quot;Recalculate&quot; replays existing games without re-fetching odds.
          </p>
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          {successMessage && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
              <p className="text-green-700">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage(null)}
                className="text-green-600 hover:text-green-800 ml-4"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('ratings')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'ratings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Ratings {snapshot && `(${snapshot.ratings.length})`}
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'schedule' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Schedule
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                History {historyGames.length > 0 && `(${historyGames.length})`}
              </button>
              <button
                onClick={() => setActiveTab('hypotheticals')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hypotheticals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Hypotheticals
              </button>
              {isLocalhost && (
              <button
                onClick={() => setActiveTab('matching')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'matching' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Matching Logs {matchingStats && `(${matchingStats.total})`}
              </button>
              )}
              {isLocalhost && (
              <button
                onClick={() => setActiveTab('overrides')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overrides' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Name Overrides {overrides.length > 0 && `(${overrides.length})`}
              </button>
              )}
              {isLocalhost && (
              <button
                onClick={() => setActiveTab('barttorvik')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'barttorvik' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                BT {btGames.length > 0 && `(${btGames.length})`}
              </button>
              )}
            </nav>
          </div>
          
          {/* Ratings Tab */}
          {activeTab === 'ratings' && snapshot && (
            <>
              <div className="p-4 border-b border-gray-200">
                <input
                  type="text"
                  placeholder="Search teams or conferences..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-blue-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase w-12 sm:w-16">#</th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase cursor-pointer" onClick={() => toggleSort('name')}>
                        <span className="hidden sm:inline">Team {sortBy === 'name' && (sortDir === 'desc' ? '↓' : '↑')}</span>
                        <span className="sm:hidden">Team</span>
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase hidden sm:table-cell">Conf</th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" onClick={() => toggleSort('rating')}>
                        <span className="hidden sm:inline">Rating</span>
                        <span className="sm:hidden">Rtg</span>
                        {sortBy === 'rating' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase hidden sm:table-cell cursor-pointer" onClick={() => toggleSort('initial')}>
                        Initial{sortBy === 'initial' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" onClick={() => toggleSort('change')}>
                        <span className="hidden sm:inline">Change</span>
                        <span className="sm:hidden">+/-</span>
                        {sortBy === 'change' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                      <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" onClick={() => toggleSort('games')}>
                        <span className="hidden sm:inline">Games</span>
                        <span className="sm:hidden">G</span>
                        {sortBy === 'games' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRatings.map((team, index) => {
                      const change = team.rating - team.initialRating;
                      const rank = sortBy === 'rating' ? (sortDir === 'desc' ? index + 1 : filteredRatings.length - index) : snapshot.ratings.findIndex(r => r.teamName === team.teamName) + 1;
                      const isExpanded = expandedTeams.has(team.teamName);
                      const teamGames = teamAdjustmentsMap.get(team.teamName) || [];
                      const hasGames = teamGames.length > 0;
                      const logoUrl = getTeamLogo(team.teamName);
                      
                      return (
                        <React.Fragment key={team.teamName}>
                          <tr 
                            className={`hover:bg-gray-50 transition-colors ${hasGames ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50' : ''}`}
                            onClick={() => hasGames && toggleTeamExpanded(team.teamName)}
                          >
                            <td className="px-2 sm:px-4 py-3 text-sm text-gray-500">{rank}</td>
                            <td className="px-2 sm:px-4 py-3">
                              <div className="flex items-center gap-1 sm:gap-2">
                                {logoUrl ? (
                                  <img 
                                    src={logoUrl} 
                                    alt={team.teamName}
                                    className="w-6 h-6 object-contain flex-shrink-0"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                ) : (
                                  <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                                    {team.teamName.charAt(0)}
                                  </div>
                                )}
                                <span className="font-medium text-gray-900 hidden sm:inline">{team.teamName}</span>
                                {hasGames && (
                                  <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">{team.conference || '-'}</td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className={`font-mono font-semibold ${team.rating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatRating(team.rating)}
                              </span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right text-sm text-gray-900 font-mono hidden sm:table-cell">
                              {formatRating(team.initialRating)} <span className="text-gray-500">(#{initialRankMap.get(team.teamName)})</span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              <span className={`text-sm font-mono ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {change > 0 ? '+' : ''}{change.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right text-sm text-gray-500">{team.gamesProcessed}</td>
                          </tr>
                          
                          {isExpanded && hasGames && (
                            <tr>
                              <td colSpan={7} className="bg-gray-50 px-4 py-0">
                                <div className="py-3 pl-8 pr-4">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-gray-500 uppercase">
                                        <th className="text-left py-2">Date</th>
                                        <th className="text-left py-2">Opponent</th>
                                        <th className="text-left py-2">Projection Formula</th>
                                        <th className="text-right py-2">Close</th>
                                        <th className="text-right py-2">Before</th>
                                        <th className="text-right py-2">After</th>
                                        <th className="text-right py-2">Impact</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {teamGames.map((adj) => {
                                        const details = getTeamGameDetails(adj, team.teamName);
                                        // Calculate the formula from this team's perspective
                                        const teamRating = details.ratingBefore;
                                        const oppRating = details.isHome ? adj.awayRatingBefore : adj.homeRatingBefore;
                                        const hcaApplied = adj.isNeutralSite ? 0 : (details.isHome ? hca : -hca);
                                        // Spread from team's perspective (negative = team favored)
                                        const teamSpread = details.isHome ? adj.projectedSpread : -adj.projectedSpread;
                                        
                                        return (
                                          <tr key={adj.gameId} className="hover:bg-gray-100">
                                            <td className="py-2 text-gray-600">{new Date(adj.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                            <td className="py-2">
                                              <div className="flex items-center gap-2">
                                                <span className="text-gray-500">{details.location}</span>
                                                {(() => {
                                                  const oppLogo = getTeamLogo(details.opponent);
                                                  return oppLogo ? (
                                                    <img 
                                                      src={oppLogo} 
                                                      alt={details.opponent}
                                                      className="w-5 h-5 object-contain"
                                                      title={details.opponent}
                                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    />
                                                  ) : null;
                                                })()}
                                                <span className="text-gray-900 hidden sm:inline">{details.opponent}</span>
                                                {adj.isNeutralSite && <span className="text-xs text-amber-600">(N)</span>}
                                              </div>
                                            </td>
                                            <td className="py-2 font-mono text-xs text-gray-600">
                                              <span className="text-gray-900">{teamRating.toFixed(1)}</span>
                                              <span className="text-gray-400"> − </span>
                                              <span className="text-gray-500">{oppRating.toFixed(1)}</span>
                                              {hcaApplied !== 0 && (
                                                <>
                                                  <span className="text-gray-400"> {hcaApplied > 0 ? '+' : '−'} </span>
                                                  <span className={hcaApplied > 0 ? 'text-green-600' : 'text-red-600'}>{Math.abs(hcaApplied).toFixed(1)}</span>
                                                </>
                                              )}
                                              <span className="text-gray-400"> = </span>
                                              <span className={`font-medium ${teamSpread < 0 ? 'text-green-700' : teamSpread > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                                                {teamSpread > 0 ? '+' : ''}{teamSpread.toFixed(1)}
                                              </span>
                                            </td>
                                            <td className="py-2 text-right font-mono text-gray-700">{formatSpread(adj.closingSpread)}</td>
                                            <td className="py-2 text-right font-mono text-gray-500">{details.ratingBefore.toFixed(2)}</td>
                                            <td className="py-2 text-right font-mono text-gray-700">{details.ratingAfter.toFixed(2)}</td>
                                            <td className={`py-2 text-right font-mono font-medium ${details.ratingChange > 0 ? 'text-green-600' : details.ratingChange < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                              {details.ratingChange > 0 ? '+' : ''}{details.ratingChange.toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Hypotheticals Tab */}
          {activeTab === 'hypotheticals' && (
            <div className="p-6">
              <div className="max-w-2xl mx-auto">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Hypothetical Matchup Calculator</h2>
                <p className="text-sm text-gray-500 mb-6">Select two teams to see the projected spread based on current power ratings.</p>
                
                {!snapshot ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No ratings available. Sync games first to use the hypothetical matchup calculator.</p>
                  </div>
                ) : (
                  <>
                    {/* Team Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end mb-6">
                      {/* Away Team */}
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Away Team</label>
                        <input
                          type="text"
                          value={awayTeamSearch}
                          onChange={(e) => {
                            setAwayTeamSearch(e.target.value);
                            setShowAwayDropdown(true);
                            if (!e.target.value) setAwayTeam('');
                          }}
                          onFocus={() => setShowAwayDropdown(true)}
                          onBlur={() => setTimeout(() => setShowAwayDropdown(false), 200)}
                          placeholder="Search team..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {showAwayDropdown && filteredAwayTeams.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredAwayTeams.map(team => (
                              <button
                                key={team.teamName}
                                onMouseDown={() => {
                                  setAwayTeam(team.teamName);
                                  setAwayTeamSearch(team.teamName);
                                  setShowAwayDropdown(false);
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-blue-50 text-sm flex justify-between items-center"
                              >
                                <span>{team.teamName}</span>
                                <span className="text-gray-400 text-xs">{formatRating(team.rating)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Swap Button */}
                      <div className="flex justify-center">
                        <button
                          onClick={swapTeams}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                          title="Swap teams"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </button>
                      </div>

                      {/* Home Team */}
                      <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Home Team</label>
                        <input
                          type="text"
                          value={homeTeamSearch}
                          onChange={(e) => {
                            setHomeTeamSearch(e.target.value);
                            setShowHomeDropdown(true);
                            if (!e.target.value) setHomeTeam('');
                          }}
                          onFocus={() => setShowHomeDropdown(true)}
                          onBlur={() => setTimeout(() => setShowHomeDropdown(false), 200)}
                          placeholder="Search team..."
                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {showHomeDropdown && filteredHomeTeams.length > 0 && (
                          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredHomeTeams.map(team => (
                              <button
                                key={team.teamName}
                                onMouseDown={() => {
                                  setHomeTeam(team.teamName);
                                  setHomeTeamSearch(team.teamName);
                                  setShowHomeDropdown(false);
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-blue-50 text-sm flex justify-between items-center"
                              >
                                <span>{team.teamName}</span>
                                <span className="text-gray-400 text-xs">{formatRating(team.rating)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Neutral Site Checkbox */}
                    <div className="flex items-center justify-center mb-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isNeutralSite}
                          onChange={(e) => setIsNeutralSite(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Neutral Site</span>
                      </label>
                    </div>

                    {/* Projection Result */}
                    {matchupProjection && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                        <div className="grid grid-cols-3 gap-4 items-center mb-6">
                          {/* Away Team */}
                          <div className="text-center">
                            {(() => {
                              const awayLogo = getTeamLogo(matchupProjection.awayTeam);
                              return awayLogo ? (
                                <img 
                                  src={awayLogo} 
                                  alt={matchupProjection.awayTeam}
                                  className="w-16 h-16 object-contain mx-auto mb-2"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-2xl text-gray-500 mx-auto mb-2">
                                  {matchupProjection.awayTeam.charAt(0)}
                                </div>
                              );
                            })()}
                            <div className="text-lg font-bold text-gray-900">{matchupProjection.awayTeam}</div>
                            <div className="text-xs text-gray-500">{matchupProjection.awayConference || 'Unknown'}</div>
                            <div className="text-sm font-mono text-gray-600 mt-1">
                              {formatRating(matchupProjection.awayRating)}
                            </div>
                          </div>

                          {/* @ Symbol */}
                          <div className="text-center text-2xl text-gray-400 font-light">
                            @
                          </div>

                          {/* Home Team */}
                          <div className="text-center">
                            {(() => {
                              const homeLogo = getTeamLogo(matchupProjection.homeTeam);
                              return homeLogo ? (
                                <img 
                                  src={homeLogo} 
                                  alt={matchupProjection.homeTeam}
                                  className="w-16 h-16 object-contain mx-auto mb-2"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-2xl text-gray-500 mx-auto mb-2">
                                  {matchupProjection.homeTeam.charAt(0)}
                                </div>
                              );
                            })()}
                            <div className="text-lg font-bold text-gray-900">{matchupProjection.homeTeam}</div>
                            <div className="text-xs text-gray-500">{matchupProjection.homeConference || 'Unknown'}</div>
                            <div className="text-sm font-mono text-gray-600 mt-1">
                              {formatRating(matchupProjection.homeRating)}
                            </div>
                          </div>
                        </div>

                        {/* Projected Spread */}
                        <div className="text-center border-t border-blue-200 pt-4">
                          <div className="text-sm text-gray-500 mb-1">Projected Spread</div>
                          <div className={`text-4xl font-bold ${
                            matchupProjection.projectedSpread < 0 ? 'text-green-600' : 
                            matchupProjection.projectedSpread > 0 ? 'text-red-600' : 'text-gray-600'
                          }`}>
                            {matchupProjection.homeTeam} {matchupProjection.projectedSpread === 0 ? 'PK' : `${matchupProjection.projectedSpread > 0 ? '+' : ''}${Math.round(matchupProjection.projectedSpread * 100) / 100}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-2">
                            {isNeutralSite ? 'Neutral site (no HCA)' : `Includes ${hca} pts HCA`}
                          </div>
                        </div>

                        {/* Calculation Breakdown */}
                        <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-gray-500 text-center font-mono">
                          Home Rating ({formatRating(matchupProjection.homeRating)}) - Away Rating ({formatRating(matchupProjection.awayRating)})
                          {!isNeutralSite && <> + HCA ({hca})</>} = {Math.round((matchupProjection.homeRating - matchupProjection.awayRating + matchupProjection.hcaApplied) * 100) / 100} → 
                          <span className="font-semibold"> Spread: {matchupProjection.projectedSpread === 0 ? 'PK' : `${matchupProjection.projectedSpread > 0 ? '+' : ''}${Math.round(matchupProjection.projectedSpread * 100) / 100}`}</span>
                        </div>
                      </div>
                    )}

                    {/* Empty state when no teams selected */}
                    {!matchupProjection && (homeTeam || awayTeam) && (
                      <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500 border border-gray-200">
                        Select both teams to see the projected spread.
                      </div>
                    )}

                    {!matchupProjection && !homeTeam && !awayTeam && (
                      <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500 border border-gray-200">
                        <div className="text-4xl mb-3">🏀</div>
                        <p>Search and select teams above to calculate a projected spread.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Schedule Tab */}
          {activeTab === 'schedule' && (
            <>
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Filter:</span>
                  <div className="flex rounded-lg overflow-hidden border border-gray-300">
                    {([
                      { key: 'all', label: 'All' },
                      { key: 'today', label: 'Today' },
                      { key: 'tomorrow', label: 'Tomorrow' },
                      { key: 'day2', label: '+2' },
                      { key: 'day3', label: '+3' },
                    ] as const).map(({ key, label }) => {
                      const count = key === 'today' ? combinedScheduleGames.filter(g => g.isToday).length
                        : key === 'tomorrow' ? combinedScheduleGames.filter(g => g.isTomorrow).length
                        : key === 'day2' ? combinedScheduleGames.filter(g => g.isDay2).length
                        : key === 'day3' ? combinedScheduleGames.filter(g => g.isDay3).length
                        : 0;
                      return (
                        <button
                          key={key}
                          onClick={() => setScheduleFilter(key)}
                          className={`px-3 py-1 text-sm font-medium ${scheduleFilter === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                          {label} {count > 0 && `(${count})`}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  onClick={loadSchedule}
                  disabled={scheduleLoading}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  {scheduleLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {/* Legend/Key for line movement colors */}
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs">
                <span className="text-gray-600 font-medium">Line Movement:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-green-200 rounded"></div>
                  <span className="text-gray-600">Toward projection</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-red-200 rounded"></div>
                  <span className="text-gray-600">Against projection</span>
                </div>
                <span className="text-gray-400 hidden sm:inline">| Intensity = magnitude of move</span>
              </div>

              {scheduleLoading ? (
                <div className="p-8 text-center text-gray-500">Loading schedule...</div>
              ) : filteredScheduleGames.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-3">📅</div>
                  <p>No games found for {scheduleFilter === 'all' ? 'the next 4 days' : scheduleFilter}.</p>
                  <p className="text-sm mt-2">Try refreshing BT data locally.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th 
                          className="px-1 sm:px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap w-10 sm:w-auto cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            setScheduleSortBy('time');
                            setScheduleSortDir('asc');
                          }}
                        >
                          Time {scheduleSortBy === 'time' && '↓'}
                        </th>
                        <th 
                          className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (scheduleSortBy === 'awayMovement') {
                              setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                            } else {
                              setScheduleSortBy('awayMovement');
                              setScheduleSortDir('desc'); // Green (positive) first
                            }
                          }}
                        >
                          Away {scheduleSortBy === 'awayMovement' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="px-1 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-6 hidden sm:table-cell"></th>
                        <th 
                          className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (scheduleSortBy === 'homeMovement') {
                              setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                            } else {
                              setScheduleSortBy('homeMovement');
                              setScheduleSortDir('desc'); // Green (positive) first
                            }
                          }}
                        >
                          Home {scheduleSortBy === 'homeMovement' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-purple-600 uppercase whitespace-nowrap">BT</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Proj</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Open</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Curr</th>
                        <th className="px-1 sm:px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">+/-</th>
                        <th 
                          className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (scheduleSortBy === 'delta') {
                              setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                            } else {
                              setScheduleSortBy('delta');
                              setScheduleSortDir('desc'); // Default to highest delta first
                            }
                          }}
                        >
                          Delta {scheduleSortBy === 'delta' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap hidden sm:table-cell">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredScheduleGames.map((game, index) => {
                        // Check if we need a date separator row
                        const prevGame = index > 0 ? filteredScheduleGames[index - 1] : null;
                        const showDateHeader = !prevGame || prevGame.gameDate !== game.gameDate;
                        
                        // Parse time for display - game.gameTime is in format like "7:00" or "7:00 PM"
                        const timeStr = game.gameTime || '—';
                        const timeStrMobile = timeStr.replace(/ ?[AP]M$/i, '');
                        const dayStr = game.dateLabel;
                        
                        // Find team rating using BT team names
                        // Need to map through overrides: torvikName -> kenpomName
                        const findTeamRating = (btTeamName: string) => {
                          if (!snapshot?.ratings) return null;
                          
                          const searchLower = btTeamName.toLowerCase();
                          
                          // 1. Check if there's an override with this torvikName -> get kenpomName
                          const overrideByTorvik = overrides.find(o => 
                            o.torvikName?.toLowerCase() === searchLower
                          );
                          if (overrideByTorvik) {
                            return snapshot.ratings.find(r => r.teamName === overrideByTorvik.kenpomName);
                          }
                          
                          // 2. Check if there's an override with this sourceName
                          const overrideBySource = overrides.find(o => 
                            o.sourceName.toLowerCase() === searchLower
                          );
                          if (overrideBySource) {
                            return snapshot.ratings.find(r => r.teamName === overrideBySource.kenpomName);
                          }
                          
                          // 3. Try exact match on teamName in ratings
                          let rating = snapshot.ratings.find(r => r.teamName === btTeamName);
                          if (rating) return rating;
                          
                          // 4. Case-insensitive exact match
                          rating = snapshot.ratings.find(r => 
                            r.teamName.toLowerCase() === searchLower
                          );
                          if (rating) return rating;
                          
                          // 5. Try matching by checking if ratings teamName is at START
                          rating = snapshot.ratings.find(r => {
                            const ratingLower = r.teamName.toLowerCase();
                            return searchLower.startsWith(ratingLower + ' ') || searchLower === ratingLower;
                          });
                          if (rating) return rating;
                          
                          // 6. Try stripping last word (mascot)
                          const words = btTeamName.split(' ');
                          if (words.length > 1) {
                            for (let i = words.length - 1; i >= 1; i--) {
                              const withoutMascot = words.slice(0, i).join(' ');
                              rating = snapshot.ratings.find(r => 
                                r.teamName.toLowerCase() === withoutMascot.toLowerCase()
                              );
                              if (rating) return rating;
                            }
                          }
                          
                          return null;
                        };
                        
                        const homeRating = findTeamRating(game.homeTeam);
                        const awayRating = findTeamRating(game.awayTeam);
                        
                        let projectedSpread: number | null = null;
                        if (homeRating && awayRating) {
                          projectedSpread = -((homeRating.rating - awayRating.rating) + hca);
                          projectedSpread = Math.round(projectedSpread * 100) / 100;
                        }
                        
                        // Calculate delta (absolute difference between projection and market)
                        let delta: number | null = null;
                        if (projectedSpread !== null && game.spread !== null) {
                          delta = Math.abs(projectedSpread - game.spread);
                          delta = Math.round(delta * 100) / 100;
                        }
                        
                        // BT spread is already in game.btSpread
                        const btSpread = game.btSpread;
                        
                        // Line movement highlighting logic
                        const getGreenHighlightClass = (movement: number): string => {
                          if (movement < 0.5) return '';
                          if (movement < 1) return 'bg-green-50';
                          if (movement < 2) return 'bg-green-100';
                          if (movement < 3) return 'bg-green-200';
                          if (movement < 4) return 'bg-green-300';
                          if (movement < 5) return 'bg-green-400';
                          return 'bg-green-500';
                        };
                        
                        const getRedHighlightClass = (movement: number): string => {
                          if (movement < 0.5) return '';
                          if (movement < 1) return 'bg-red-50';
                          if (movement < 2) return 'bg-red-100';
                          if (movement < 3) return 'bg-red-200';
                          if (movement < 4) return 'bg-red-300';
                          if (movement < 5) return 'bg-red-400';
                          return 'bg-red-500';
                        };
                        
                        let highlightAwayClass = '';
                        let highlightHomeClass = '';
                        
                        if (projectedSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
                          const openDiff = Math.abs(projectedSpread - game.openingSpread);
                          const currentDiff = Math.abs(projectedSpread - game.spread);
                          const lineMovement = Math.abs(game.spread - game.openingSpread);
                          
                          const movingToward = currentDiff < openDiff;
                          const highlightClass = movingToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                          
                          if (game.spread < game.openingSpread) {
                            highlightHomeClass = highlightClass;
                          } else {
                            highlightAwayClass = highlightClass;
                          }
                        }
                        
                        return (
                          <React.Fragment key={game.id}>
                            {showDateHeader && (
                              <tr className="bg-blue-100">
                                <td colSpan={11} className="px-4 py-2">
                                  <span className="font-semibold text-blue-800 text-sm">
                                    {game.dateLabel}
                                    {game.isToday && ' 📍'}
                                  </span>
                                  <span className="text-blue-600 text-xs ml-2">
                                    ({filteredScheduleGames.filter(g => g.gameDate === game.gameDate).length} games)
                                  </span>
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-gray-50">
                            <td className="px-1 sm:px-4 py-3">
                              <div className="text-xs sm:text-sm font-medium text-gray-900">
                                <span className="sm:hidden">{timeStrMobile}</span>
                                <span className="hidden sm:inline">{timeStr}</span>
                              </div>
                              <div className="text-xs text-gray-500">{dayStr}</div>
                            </td>
                            <td className={`px-1 sm:px-4 py-3 ${highlightAwayClass}`}>
                              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                                {(() => {
                                  const awayLogo = getTeamLogo(game.awayTeam);
                                  return awayLogo ? (
                                    <img 
                                      src={awayLogo} 
                                      alt={game.awayTeam}
                                      className="w-6 h-6 sm:w-6 sm:h-6 object-contain flex-shrink-0"
                                      title={game.awayTeam}
                                    />
                                  ) : (
                                    <div className="w-6 h-6 sm:w-6 sm:h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-500 flex-shrink-0" title={game.awayTeam}>
                                      {game.awayTeam.charAt(0)}
                                    </div>
                                  );
                                })()}
                                <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.awayTeam}</span>
                                {!awayRating && <span className="text-xs text-red-400 hidden sm:inline" title="Team not found in ratings">?</span>}
                              </div>
                            </td>
                            <td className="px-1 py-3 text-center text-gray-400 hidden sm:table-cell">@</td>
                            <td className={`px-1 sm:px-4 py-3 ${highlightHomeClass}`}>
                              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                                {(() => {
                                  const homeLogo = getTeamLogo(game.homeTeam);
                                  return homeLogo ? (
                                    <img 
                                      src={homeLogo} 
                                      alt={game.homeTeam}
                                      className="w-6 h-6 sm:w-6 sm:h-6 object-contain flex-shrink-0"
                                      title={game.homeTeam}
                                    />
                                  ) : (
                                    <div className="w-6 h-6 sm:w-6 sm:h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-500 flex-shrink-0" title={game.homeTeam}>
                                      {game.homeTeam.charAt(0)}
                                    </div>
                                  );
                                })()}
                                <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.homeTeam}</span>
                                {!homeRating && <span className="text-xs text-red-400 hidden sm:inline" title="Team not found in ratings">?</span>}
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {btSpread !== null ? (
                                <span className="font-mono text-xs sm:text-sm font-semibold text-purple-600">
                                  {btSpread > 0 ? '+' : ''}{btSpread.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {projectedSpread !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold ${projectedSpread < 0 ? 'text-green-600' : projectedSpread > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {projectedSpread > 0 ? '+' : ''}{projectedSpread.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs" title="Team not found in ratings">⚠️</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {game.openingSpread !== null ? (
                                <div className="relative inline-flex items-center">
                                  {game.openingSpread !== 0 && getTeamLogo(game.homeTeam) && (
                                    <img 
                                      src={getTeamLogo(game.homeTeam)!}
                                      alt=""
                                      className="absolute -bottom-2 -right-3 w-4 h-4 object-contain"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                  <span className={`font-mono text-xs sm:text-sm font-semibold ${game.openingSpread < 0 ? 'text-green-600' : game.openingSpread > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                    {game.openingSpread > 0 ? '+' : ''}{game.openingSpread}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {game.spread !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold ${game.spread < 0 ? 'text-green-600' : game.spread > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {game.spread > 0 ? '+' : ''}{game.spread}
                                  {game.isFrozen && <span className="ml-1 text-gray-400" title="Closing line (game started)">🔒</span>}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-xs" title="No odds available yet">—</span>
                              )}
                            </td>
                            <td className="px-1 sm:px-4 py-3 text-center">
                              {(() => {
                                if (projectedSpread === null || game.openingSpread === null || game.spread === null) {
                                  return <span className="text-gray-300">—</span>;
                                }
                                if (game.openingSpread === game.spread) {
                                  return <span className="text-gray-400">—</span>;
                                }
                                const openDiff = Math.abs(projectedSpread - game.openingSpread);
                                const currentDiff = Math.abs(projectedSpread - game.spread);
                                if (currentDiff < openDiff) {
                                  return <span className="text-green-600 font-bold">+</span>;
                                } else {
                                  return <span className="text-red-600 font-bold">−</span>;
                                }
                              })()}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {delta !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold px-1 sm:px-2 py-1 rounded ${delta >= 3 ? 'bg-green-100' : 'bg-gray-100'}`}>
                                  {delta.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right hidden sm:table-cell">
                              {game.total !== null ? (
                                <span className="font-mono text-xs sm:text-sm text-gray-700">{game.total}</span>
                              ) : game.btTotal !== null ? (
                                <span className="font-mono text-xs sm:text-sm text-purple-400" title="BT projected total">{game.btTotal.toFixed(0)}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-100 bg-blue-50">
                    Open & Current spreads sourced from Pinnacle, with DraftKings/FanDuel/BetMGM/BetRivers average as fallback.
                  </div>
                </div>
              )}
            </>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <>
              <div className="p-4 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-600">Date Range:</span>
                    <input
                      type="date"
                      value={historyStartDate}
                      onChange={(e) => setHistoryStartDate(e.target.value)}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="date"
                      value={historyEndDate}
                      onChange={(e) => setHistoryEndDate(e.target.value)}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                    />
                    {(historyStartDate || historyEndDate) && (
                      <button
                        onClick={() => { setHistoryStartDate(''); setHistoryEndDate(''); }}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                    )}
                    <span className="text-gray-300 mx-2">|</span>
                    <span className="text-sm text-gray-600">|Diff| ≥</span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={historyDiffMinDisplay}
                      onChange={(e) => setHistoryDiffMinDisplay(parseFloat(e.target.value))}
                      onMouseUp={(e) => setHistoryDiffMin(parseFloat((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => setHistoryDiffMin(parseFloat((e.target as HTMLInputElement).value))}
                      className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-xs text-gray-600 font-mono w-6">{historyDiffMinDisplay}</span>
                    {historyDiffMinDisplay !== 0 && (
                      <button
                        onClick={() => { setHistoryDiffMinDisplay(0); setHistoryDiffMin(0); }}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">
                      Showing {filteredHistoryGames.length} of {historyGames.length} games
                    </span>
                    <button
                      onClick={loadHistory}
                      disabled={historyLoading}
                      className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                    >
                      {historyLoading ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Loading...
                        </span>
                      ) : 'Refresh'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Legend for line movement */}
              <div className="px-4 py-2 text-xs flex flex-wrap items-center gap-2 sm:gap-4 bg-gray-50 border-b border-gray-100">
                <span className="text-gray-500">Line Movement:</span>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-green-200 rounded"></div>
                  <span className="text-gray-600">Toward projection</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 bg-red-200 rounded"></div>
                  <span className="text-gray-600">Against projection</span>
                </div>
                <span className="text-gray-400 ml-2">| Click column headers to sort</span>
              </div>
              
              {historyLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Loading history...
                </div>
              ) : filteredHistoryGames.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-3">📊</div>
                  <p>No historical games found.</p>
                  <p className="text-sm mt-2">{historyGames.length > 0 ? 'Try adjusting the date filter.' : 'Sync games to build history.'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th 
                          className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (historySortField === 'date') {
                              setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                            } else {
                              setHistorySortField('date');
                              setHistorySortDirection('desc');
                            }
                          }}
                        >
                          Date {historySortField === 'date' && (historySortDirection === 'desc' ? '↓' : '↑')}
                        </th>
                        <th 
                          className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (historySortField === 'awayMovement') {
                              setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                            } else {
                              setHistorySortField('awayMovement');
                              setHistorySortDirection('desc');
                            }
                          }}
                        >
                          Away {historySortField === 'awayMovement' && (historySortDirection === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="px-1 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-6 hidden sm:table-cell"></th>
                        <th 
                          className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (historySortField === 'homeMovement') {
                              setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                            } else {
                              setHistorySortField('homeMovement');
                              setHistorySortDirection('desc');
                            }
                          }}
                        >
                          Home {historySortField === 'homeMovement' && (historySortDirection === 'desc' ? '↓' : '↑')}
                        </th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Proj</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Open</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Close</th>
                        <th className="px-1 sm:px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase">+/-</th>
                        <th 
                          className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            if (historySortField === 'diff') {
                              setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                            } else {
                              setHistorySortField('diff');
                              setHistorySortDirection('asc');
                            }
                          }}
                        >
                          Diff {historySortField === 'diff' && (historySortDirection === 'desc' ? '↓' : '↑')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredHistoryGames.map((game) => {
                        const gameDate = new Date(game.gameDate);
                        const dateStr = gameDate.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        });
                        
                        // Line movement highlighting logic (same as Schedule tab)
                        const getGreenHighlightClass = (movement: number): string => {
                          if (movement < 0.5) return '';
                          if (movement < 1) return 'bg-green-50';
                          if (movement < 2) return 'bg-green-100';
                          if (movement < 3) return 'bg-green-200';
                          if (movement < 4) return 'bg-green-300';
                          if (movement < 5) return 'bg-green-400';
                          return 'bg-green-500';
                        };
                        
                        const getRedHighlightClass = (movement: number): string => {
                          if (movement < 0.5) return '';
                          if (movement < 1) return 'bg-red-50';
                          if (movement < 2) return 'bg-red-100';
                          if (movement < 3) return 'bg-red-200';
                          if (movement < 4) return 'bg-red-300';
                          if (movement < 5) return 'bg-red-400';
                          return 'bg-red-500';
                        };
                        
                        let highlightAwayClass = '';
                        let highlightHomeClass = '';
                        let lineMovedToward: boolean | null = null;
                        
                        if (game.projectedSpread !== null && game.openingSpread !== null && game.closingSpread !== null && game.openingSpread !== game.closingSpread) {
                          const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
                          const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
                          const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
                          
                          lineMovedToward = closeDiff < openDiff;
                          const highlightClass = lineMovedToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                          
                          // If spread decreased (e.g., -3 to -5), line moved toward home team
                          if (game.closingSpread < game.openingSpread) {
                            highlightHomeClass = highlightClass;
                          } else {
                            highlightAwayClass = highlightClass;
                          }
                        }
                        
                        // Get logos
                        const homeLogo = getTeamLogo(game.homeTeam);
                        const awayLogo = getTeamLogo(game.awayTeam);
                        
                        return (
                          <tr key={game.id} className="hover:bg-gray-50">
                            <td className="px-2 sm:px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {dateStr}
                            </td>
                            <td className={`px-1 sm:px-4 py-3 ${highlightAwayClass}`}>
                              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                                {awayLogo ? (
                                  <img src={awayLogo} alt={game.awayTeam} className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                                    {game.awayTeam.charAt(0)}
                                  </div>
                                )}
                                <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.awayTeam}</span>
                              </div>
                            </td>
                            <td className="px-1 py-3 text-center text-gray-400 hidden sm:table-cell">@</td>
                            <td className={`px-1 sm:px-4 py-3 ${highlightHomeClass}`}>
                              <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2">
                                {homeLogo ? (
                                  <img src={homeLogo} alt={game.homeTeam} className="w-5 h-5 sm:w-6 sm:h-6 object-contain flex-shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                  <div className="w-5 h-5 sm:w-6 sm:h-6 bg-gray-200 rounded-full flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                                    {game.homeTeam.charAt(0)}
                                  </div>
                                )}
                                <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.homeTeam}</span>
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-sm text-right font-mono">
                              {game.projectedSpread !== null 
                                ? (game.projectedSpread > 0 ? '+' : '') + game.projectedSpread.toFixed(1)
                                : '—'}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {game.openingSpread !== null ? (
                                <div className="relative inline-flex items-center">
                                  {game.openingSpread !== 0 && homeLogo && (
                                    <img 
                                      src={homeLogo}
                                      alt=""
                                      className="absolute -bottom-2 -right-3 w-4 h-4 object-contain"
                                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                  )}
                                  <span className="font-mono text-xs sm:text-sm">
                                    {game.openingSpread > 0 ? '+' : ''}{game.openingSpread.toFixed(1)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-sm text-right font-mono font-semibold">
                              {game.closingSpread !== null 
                                ? (game.closingSpread > 0 ? '+' : '') + game.closingSpread.toFixed(1)
                                : '—'}
                            </td>
                            <td className="px-1 sm:px-2 py-3 text-center">
                              {lineMovedToward === null ? (
                                <span className="text-gray-300">—</span>
                              ) : lineMovedToward ? (
                                <span className="text-green-600 font-bold">+</span>
                              ) : (
                                <span className="text-red-600 font-bold">−</span>
                              )}
                            </td>
                            <td className={`px-2 sm:px-4 py-3 text-sm text-right font-mono font-semibold ${
                              game.difference !== null 
                                ? game.difference > 0 ? 'text-red-600' : game.difference < 0 ? 'text-green-600' : 'text-gray-400'
                                : 'text-gray-400'
                            }`}>
                              {game.difference !== null 
                                ? (game.difference > 0 ? '+' : '') + game.difference.toFixed(1)
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="px-4 py-2 text-xs text-gray-600 border-t border-gray-100 bg-gray-50">
                    Diff = Close − Proj (negative = market moved toward our projection)
                  </div>
                </div>
              )}
            </>
          )}

          {/* Matching Log Tab */}
          {isLocalhost && activeTab === 'matching' && (
            <>
              {matchingStats && (
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Total:</span>
                      <span className="font-semibold">{matchingStats.total}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-500"></span>
                      <span className="text-sm">Matched: <span className="font-semibold text-green-700">{matchingStats.success}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                      <span className="text-sm">Not Found: <span className="font-semibold text-orange-700">{matchingStats.homeNotFound + matchingStats.awayNotFound + matchingStats.bothNotFound}</span></span>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Filter:</span>
                  <div className="flex rounded-lg overflow-hidden border border-gray-300">
                    {(['all', 'success', 'failed'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setLogFilter(filter)}
                        className={`px-3 py-1 text-sm font-medium ${logFilter === filter ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {filter.charAt(0).toUpperCase() + filter.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm w-64"
                />
              </div>

              {logsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ESPN Teams</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Matched To</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Spread</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredLogs.map((log) => (
                        <tr key={log.gameId} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(log.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm">
                              <span className={!log.awayFound && log.status !== 'success' ? 'text-red-600 font-medium' : 'text-gray-900'}>
                                {log.espnAway}
                              </span>
                              <span className="text-gray-400 mx-1">@</span>
                              <span className={!log.homeFound && log.status !== 'success' ? 'text-red-600 font-medium' : 'text-gray-900'}>
                                {log.espnHome}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm">
                              {log.status === 'success' ? (
                                <>
                                  <span className="text-green-700">{log.matchedAway}</span>
                                  <span className="text-gray-400 mx-1">@</span>
                                  <span className="text-green-700">{log.matchedHome}</span>
                                </>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(log.status)}`}>
                              {getStatusLabel(log.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-gray-700">
                            {log.closingSpread !== null ? formatSpread(log.closingSpread) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {(log.status === 'home_not_found' || log.status === 'away_not_found' || log.status === 'both_not_found') && (
                              <button
                                onClick={() => {
                                  const teamToFix = !log.homeFound ? log.espnHome : log.espnAway;
                                  openAddOverrideModal(teamToFix);
                                }}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                Add Override
                              </button>
                            )}
                            {log.status === 'no_odds' && (
                              <div className="flex flex-col gap-1">
                                <div className="flex gap-2 text-xs">
                                  <button
                                    onClick={() => openAddOverrideModal(log.espnHome, '')}
                                    className="text-orange-600 hover:text-orange-800 font-medium"
                                    title={`Map: ${log.espnHome}`}
                                  >
                                    Map Home
                                  </button>
                                  <span className="text-gray-400">|</span>
                                  <button
                                    onClick={() => openAddOverrideModal(log.espnAway, '')}
                                    className="text-orange-600 hover:text-orange-800 font-medium"
                                    title={`Map: ${log.espnAway}`}
                                  >
                                    Map Away
                                  </button>
                                </div>
                                <button
                                  onClick={() => markAsNonD1(log)}
                                  className="text-gray-500 hover:text-gray-700 text-xs"
                                >
                                  Mark Non-D1
                                </button>
                              </div>
                            )}
                            {log.status === 'no_spread' && (
                              <button
                                onClick={() => markAsNonD1(log)}
                                className="text-gray-500 hover:text-gray-700 text-xs"
                              >
                                Mark Non-D1
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Overrides Tab */}
          {isLocalhost && activeTab === 'overrides' && (
            <>
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Team Name Overrides</h2>
                  <p className="text-sm text-gray-500">Manual mappings for team names across data sources</p>
                </div>
                <button
                  onClick={() => openAddOverrideModal()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                >
                  + Add Override
                </button>
              </div>

              {overridesLoading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : overrides.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No overrides yet. Add one to map unmatched team names.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Source</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">KenPom</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">ESPN</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Odds API</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-purple-600 uppercase">Torvik</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overrides.map((override) => (
                        <tr key={override.id} className={inlineEditId === override.id ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                          {inlineEditId === override.id ? (
                            <>
                              <td className="px-2 py-1">
                                <input
                                  ref={inlineSourceNameRef}
                                  type="text"
                                  defaultValue={override.sourceName}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  ref={inlineKenpomNameRef}
                                  type="text"
                                  defaultValue={override.kenpomName}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                />
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  ref={inlineEspnNameRef}
                                  type="text"
                                  defaultValue={override.espnName || ''}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1 relative">
                                <input
                                  ref={inlineOddsApiRef}
                                  type="text"
                                  defaultValue={override.oddsApiName || ''}
                                  onChange={(e) => {
                                    setInlineOddsApiSearch(e.target.value);
                                    setShowInlineOddsApiDropdown(e.target.value.length > 0);
                                  }}
                                  onFocus={(e) => {
                                    setInlineOddsApiSearch(e.target.value);
                                    setShowInlineOddsApiDropdown(e.target.value.length > 0);
                                  }}
                                  onBlur={() => setTimeout(() => setShowInlineOddsApiDropdown(false), 150)}
                                  className="w-full border border-orange-300 rounded px-2 py-1 text-sm bg-white"
                                  placeholder="Type to search..."
                                />
                                {showInlineOddsApiDropdown && filteredInlineOddsApiTeams.length > 0 && (
                                  <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {filteredInlineOddsApiTeams.map((team) => (
                                      <button
                                        key={team}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (inlineOddsApiRef.current) {
                                            inlineOddsApiRef.current.value = team;
                                          }
                                          setInlineOddsApiSearch(team);
                                          setShowInlineOddsApiDropdown(false);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 border-b border-gray-100 last:border-b-0"
                                      >
                                        {team}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1 relative">
                                <input
                                  ref={inlineTorvikRef}
                                  type="text"
                                  defaultValue={override.torvikName || ''}
                                  onChange={(e) => {
                                    setInlineTorvikSearch(e.target.value);
                                    setShowInlineTorvikDropdown(e.target.value.length > 0);
                                  }}
                                  onFocus={(e) => {
                                    setInlineTorvikSearch(e.target.value);
                                    setShowInlineTorvikDropdown(e.target.value.length > 0);
                                  }}
                                  onBlur={() => setTimeout(() => setShowInlineTorvikDropdown(false), 150)}
                                  className="w-full border border-purple-300 rounded px-2 py-1 text-sm bg-white"
                                  placeholder="Type to search..."
                                />
                                {showInlineTorvikDropdown && filteredInlineTorvikTeams.length > 0 && (
                                  <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                    {filteredInlineTorvikTeams.map((team) => (
                                      <button
                                        key={team}
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          if (inlineTorvikRef.current) {
                                            inlineTorvikRef.current.value = team;
                                          }
                                          setInlineTorvikSearch(team);
                                          setShowInlineTorvikDropdown(false);
                                        }}
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 border-b border-gray-100 last:border-b-0"
                                      >
                                        {team}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <input
                                  ref={inlineNotesRef}
                                  type="text"
                                  defaultValue={override.notes || ''}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-white"
                                  placeholder="—"
                                />
                              </td>
                              <td className="px-2 py-1 text-center whitespace-nowrap">
                                <button
                                  onClick={saveInlineEdit}
                                  className="text-green-600 hover:text-green-800 text-xs font-medium mr-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelInlineEdit}
                                  className="text-gray-500 hover:text-gray-700 text-xs font-medium"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 font-medium text-gray-900">{override.sourceName}</td>
                              <td className="px-3 py-2 text-green-700 font-medium">{override.kenpomName}</td>
                              <td className="px-3 py-2 text-blue-600">{override.espnName || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-orange-600">{override.oddsApiName || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-purple-600 font-medium">{override.torvikName || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-gray-500 truncate max-w-32">{override.notes || <span className="text-gray-300">—</span>}</td>
                              <td className="px-3 py-2 text-center whitespace-nowrap">
                                <button
                                  onClick={() => startInlineEdit(override)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => deleteOverride(override.id!)}
                                  className="text-red-600 hover:text-red-800 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Barttorvik Tab */}
          {isLocalhost && activeTab === 'barttorvik' && (
            <>
              {/* Sub-tabs and controls */}
              <div className="p-4 border-b border-gray-200 bg-purple-50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 font-medium">View:</span>
                    <div className="flex rounded-lg overflow-hidden border border-purple-300">
                      <button
                        onClick={() => setBtView('schedule')}
                        className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                          btView === 'schedule' 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-white text-purple-700 hover:bg-purple-50'
                        }`}
                      >
                        Schedule
                      </button>
                      <button
                        onClick={() => setBtView('ratings')}
                        className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                          btView === 'ratings' 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-white text-purple-700 hover:bg-purple-50'
                        }`}
                      >
                        T-Rank
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search teams..."
                      value={btSearchTerm}
                      onChange={(e) => setBtSearchTerm(e.target.value)}
                      className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48"
                    />
                    <button
                      onClick={loadBarttorvik}
                      disabled={btLoading}
                      className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {btLoading ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      onClick={syncTorvikTeams}
                      disabled={btLoading}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-100 text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-300"
                      title="Save all Torvik team names to database (run once)"
                    >
                      Sync Teams
                    </button>
                  </div>
                </div>
                
                {btError && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-amber-700 text-sm">ℹ️ {btError}</p>
                  </div>
                )}
              </div>

              {btLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
                  <p className="text-gray-500">Loading Barttorvik data...</p>
                </div>
              ) : (
                <>
                  {/* Schedule View */}
                  {btView === 'schedule' && (
                    <div className="overflow-x-auto">
                      {btGames.length === 0 ? (
                        <div className="p-12 text-center">
                          <div className="text-5xl mb-4">📅</div>
                          <p className="text-gray-500">No games loaded. Click Refresh to fetch data.</p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-purple-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase">Time</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase">Away</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase">Home</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">Line</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">BT Proj</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">Total</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">BT Total</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">Win %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {btGames
                              .filter(g => {
                                if (!btSearchTerm) return true;
                                const term = btSearchTerm.toLowerCase();
                                return g.away_team.toLowerCase().includes(term) || 
                                       g.home_team.toLowerCase().includes(term);
                              })
                              .map((game, idx) => {
                                const spreadDiff = game.spread && game.predicted_spread 
                                  ? Math.abs(game.spread - game.predicted_spread) 
                                  : null;
                                const totalDiff = game.total && game.predicted_total
                                  ? Math.abs(game.total - game.predicted_total)
                                  : null;
                                const hasEdge = (spreadDiff && spreadDiff >= 2) || (totalDiff && totalDiff >= 3);
                                
                                // Show warning if no market data (couldn't match to Odds API)
                                const noMarketData = game.spread == null;
                                
                                return (
                                  <tr 
                                    key={idx} 
                                    className={`hover:bg-purple-50 transition-colors ${hasEdge ? 'bg-green-50' : ''}`}
                                  >
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      <div>{game.date}</div>
                                      <div className="text-xs text-gray-400">{game.time}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        {game.away_rank && (
                                          <span className="text-xs text-purple-600 font-semibold">#{game.away_rank}</span>
                                        )}
                                        {noMarketData && <span className="text-amber-500" title={`No Odds API match for "${game.away_team}"`}>⚠️</span>}
                                        <span className={`font-medium ${noMarketData ? 'text-amber-700' : 'text-gray-900'}`}>{game.away_team}</span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        {game.home_rank && (
                                          <span className="text-xs text-purple-600 font-semibold">#{game.home_rank}</span>
                                        )}
                                        {noMarketData && <span className="text-amber-500" title={`No Odds API match for "${game.home_team}"`}>⚠️</span>}
                                        <span className={`font-medium ${noMarketData ? 'text-amber-700' : 'text-gray-900'}`}>{game.home_team}</span>
                                        {game.neutral && <span className="text-xs text-gray-400">(N)</span>}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {game.spread != null ? (
                                        <span className={`font-mono ${game.spread < 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {game.spread > 0 ? '+' : ''}{game.spread.toFixed(1)}
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {game.predicted_spread != null ? (
                                        <span className={`font-mono font-semibold ${
                                          spreadDiff && spreadDiff >= 2 ? 'text-purple-700 bg-purple-100 px-2 py-0.5 rounded' : 'text-gray-700'
                                        }`}>
                                          {game.predicted_spread > 0 ? '+' : ''}{game.predicted_spread.toFixed(1)}
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono text-gray-600">
                                      {game.total?.toFixed(1) || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {game.predicted_total != null ? (
                                        <span className={`font-mono font-semibold ${
                                          totalDiff && totalDiff >= 3 ? 'text-purple-700 bg-purple-100 px-2 py-0.5 rounded' : 'text-gray-700'
                                        }`}>
                                          {game.predicted_total.toFixed(1)}
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      {game.home_win_prob != null ? (
                                        <div className="text-xs">
                                          <div className="text-gray-500">{(game.away_win_prob! * 100).toFixed(0)}%</div>
                                          <div className="font-semibold text-purple-700">{(game.home_win_prob * 100).toFixed(0)}%</div>
                                        </div>
                                      ) : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Ratings View */}
                  {btView === 'ratings' && (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      {btRatings.length === 0 ? (
                        <div className="p-12 text-center">
                          <div className="text-5xl mb-4">📊</div>
                          <p className="text-gray-500">No ratings loaded. Click Refresh to fetch data.</p>
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-purple-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase w-16">#</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase">Team</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-purple-800 uppercase">Conf</th>
                              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-800 uppercase">Record</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-purple-800 uppercase">AdjO</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-purple-800 uppercase">AdjD</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-purple-800 uppercase">AdjT</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold text-purple-800 uppercase">Barthag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {btRatings
                              .filter(r => {
                                if (!btSearchTerm) return true;
                                const term = btSearchTerm.toLowerCase();
                                return r.team.toLowerCase().includes(term) || 
                                       r.conf.toLowerCase().includes(term);
                              })
                              .map((rating) => (
                                <tr key={`${rating.rank}-${rating.team}`} className="hover:bg-purple-50 transition-colors">
                                  <td className="px-4 py-3 text-sm font-semibold text-purple-700">{rating.rank}</td>
                                  <td className="px-4 py-3">
                                    <span className="font-medium text-gray-900">{rating.team}</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600">{rating.conf}</td>
                                  <td className="px-4 py-3 text-center text-sm text-gray-600">{rating.record}</td>
                                  <td className="px-4 py-3 text-right font-mono text-sm text-green-700">{rating.adj_o.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right font-mono text-sm text-red-700">{rating.adj_d.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-600">{rating.adj_t.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-purple-700">
                                    {rating.barthag.toFixed(4)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        
        {/* Empty State */}
        {!snapshot && !loading && activeTab === 'ratings' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center mt-6">
            <div className="text-6xl mb-4">📊</div>
            <h2 className="text-xl font-semibold mb-2 text-gray-900">No Ratings Calculated Yet</h2>
            <p className="text-gray-500 mb-6">Click &ldquo;Sync Games&rdquo; to generate market-adjusted power ratings.</p>
          </div>
        )}
      </main>

      {/* Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              {editingOverride ? 'Edit Override' : 'Add Team Override'}
            </h3>
            
            {overrideError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {overrideError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Name (ESPN/OddsAPI)
                </label>
                <input
                  type="text"
                  value={newOverride.sourceName}
                  onChange={(e) => setNewOverride({ ...newOverride, sourceName: e.target.value })}
                  placeholder="e.g., Massachusetts Minutemen"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  KenPom Name
                </label>
                <input
                  type="text"
                  value={kenpomSearch}
                  onChange={(e) => {
                    setKenpomSearch(e.target.value);
                    setNewOverride({ ...newOverride, kenpomName: e.target.value });
                    setShowKenpomDropdown(true);
                  }}
                  onFocus={() => setShowKenpomDropdown(true)}
                  placeholder="Type to search (e.g., Colgate, Duke, UMass)..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                  autoComplete="off"
                />
                {kenpomTeams.length === 0 && kenpomSearch && (
                  <p className="mt-1 text-sm text-gray-500">Loading teams...</p>
                )}
                {showKenpomDropdown && filteredKenpomTeams.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white shadow-lg">
                    {filteredKenpomTeams.map((team) => (
                      <button
                        key={team}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault(); // Prevent input blur before click registers
                          setKenpomSearch(team);
                          setNewOverride({ ...newOverride, kenpomName: team });
                          setShowKenpomDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                          newOverride.kenpomName === team ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {team}
                      </button>
                    ))}
                  </div>
                )}
                {kenpomSearch && kenpomSearch.length >= 1 && filteredKenpomTeams.length === 0 && kenpomTeams.length > 0 && (
                  <p className="mt-1 text-sm text-orange-600">No teams found matching &ldquo;{kenpomSearch}&rdquo;</p>
                )}
                {newOverride.kenpomName && !showKenpomDropdown && (
                  <p className="mt-1 text-sm text-green-600">✓ Selected: {newOverride.kenpomName}</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={newOverride.notes}
                  onChange={(e) => setNewOverride({ ...newOverride, notes: e.target.value })}
                  placeholder="e.g., Common abbreviation"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ESPN Name (for logo lookup, optional)
                </label>
                <input
                  type="text"
                  value={newOverride.espnName}
                  onChange={(e) => setNewOverride({ ...newOverride, espnName: e.target.value })}
                  placeholder="e.g., UConn, NC State, Ole Miss"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Only needed if logo doesn&apos;t show. Use ESPN&apos;s display name.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Odds API Name (for game matching, optional)
                </label>
                <input
                  type="text"
                  value={oddsApiSearch}
                  onChange={(e) => {
                    setOddsApiSearch(e.target.value);
                    setNewOverride({ ...newOverride, oddsApiName: e.target.value });
                    setShowOddsApiDropdown(true);
                  }}
                  onFocus={() => setShowOddsApiDropdown(true)}
                  placeholder="Type to search (e.g., CSU Northridge, Oklahoma St)..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                  autoComplete="off"
                />
                {oddsApiTeams.length === 0 && oddsApiSearch && (
                  <p className="mt-1 text-sm text-gray-500">No Odds API teams loaded yet. Run a sync first to populate.</p>
                )}
                {showOddsApiDropdown && filteredOddsApiTeams.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white shadow-lg">
                    {filteredOddsApiTeams.map((team) => (
                      <button
                        key={team}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setOddsApiSearch(team);
                          setNewOverride({ ...newOverride, oddsApiName: team });
                          setShowOddsApiDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-gray-100 last:border-b-0 ${
                          newOverride.oddsApiName === team ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {team}
                      </button>
                    ))}
                  </div>
                )}
                {oddsApiSearch && oddsApiSearch.length >= 1 && filteredOddsApiTeams.length === 0 && oddsApiTeams.length > 0 && (
                  <p className="mt-1 text-sm text-orange-600">No teams found matching &ldquo;{oddsApiSearch}&rdquo;</p>
                )}
                {newOverride.oddsApiName && !showOddsApiDropdown && (
                  <p className="mt-1 text-sm text-green-600">✓ Selected: {newOverride.oddsApiName}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Use if games fail with &quot;No Odds&quot;. Select the matching team from Odds API.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Torvik Name (for BT schedule matching, optional)
                </label>
                <input
                  type="text"
                  value={newOverride.torvikName || ''}
                  onChange={(e) => setNewOverride({ ...newOverride, torvikName: e.target.value })}
                  placeholder="e.g., Miami OH, N.C. State, UConn"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use the exact team name from Barttorvik&apos;s schedule to match with market odds.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveOverride}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                {editingOverride ? 'Save Changes' : 'Add Override'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12 py-6 bg-white">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Initial ratings from KenPom final AdjEM, adjusted using closing lines.</p>
        </div>
      </footer>
    </div>
  );
}
