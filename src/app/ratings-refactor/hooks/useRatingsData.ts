// src/app/ratings/hooks/useRatingsData.ts
// Main data management hook for ratings page

import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_RATINGS_CONFIG } from '@/lib/ratings/constants';
import type {
  RatingsSnapshot,
  ClosingLineSource,
  MatchingLog,
  MatchingStats,
  TeamOverride,
  CalculateResponse,
  BTGame,
  BTRating,
  ScheduleGame,
  CombinedScheduleGame,
  HistoryGame,
} from '../types';
import { 
  normalizeTeamName, 
  normalizeForFuzzyMatch, 
  teamsMatch,
  parseTimeToMinutes,
  hasGameStarted,
  getDateInfo,
} from '../utils/teamMatching';

export interface UseRatingsDataReturn {
  // Core state
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  snapshot: RatingsSnapshot | null;
  syncRange: { firstGameDate: string | null; lastGameDate: string | null } | null;
  
  // Config
  hca: number;
  setHca: (hca: number) => void;
  closingSource: ClosingLineSource;
  setClosingSource: (source: ClosingLineSource) => void;
  
  // Localhost check
  isLocalhost: boolean;
  
  // Team logos
  teamLogos: Record<string, string>;
  espnNameMap: Record<string, string>;
  getTeamLogo: (teamName: string) => string | null;
  
  // Matching logs
  matchingLogs: MatchingLog[];
  matchingStats: MatchingStats | null;
  logsLoading: boolean;
  nonD1GameIds: Set<string>;
  
  // Overrides
  overrides: TeamOverride[];
  kenpomTeams: string[];
  oddsApiTeams: string[];
  torvikTeams: string[];
  overridesLoading: boolean;
  
  // Schedule
  scheduleGames: ScheduleGame[];
  combinedScheduleGames: CombinedScheduleGame[];
  scheduleLoading: boolean;
  oddsLoading: boolean;
  oddsError: string | null;
  
  // History
  historyGames: HistoryGame[];
  historyLoading: boolean;
  
  // Barttorvik
  btGames: BTGame[];
  btRatings: BTRating[];
  btLoading: boolean;
  btError: string | null;
  
  // Actions
  loadRatings: () => Promise<void>;
  loadMatchingLogs: () => Promise<void>;
  loadOverrides: () => Promise<void>;
  loadSchedule: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadBarttorvik: () => Promise<void>;
  calculateRatings: (params: {
    startDate?: string;
    endDate?: string;
    maxGames?: number;
  }) => Promise<void>;
  recalculateRatings: () => Promise<void>;
  markAsNonD1: (log: MatchingLog) => Promise<void>;
  syncTorvikTeams: () => Promise<void>;
  setError: (error: string | null) => void;
  setSuccessMessage: (message: string | null) => void;
  clearMessages: () => void;
}

export function useRatingsData(): UseRatingsDataReturn {
  // Core state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RatingsSnapshot | null>(null);
  const [syncRange, setSyncRange] = useState<{ firstGameDate: string | null; lastGameDate: string | null } | null>(null);
  
  // Config
  const [hca, setHca] = useState(DEFAULT_RATINGS_CONFIG.hca);
  const [closingSource, setClosingSource] = useState<ClosingLineSource>(DEFAULT_RATINGS_CONFIG.closingSource);
  
  // Localhost check
  const [isLocalhost, setIsLocalhost] = useState(false);
  
  // Team logos
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [espnNameMap, setEspnNameMap] = useState<Record<string, string>>({});
  
  // Matching logs
  const [matchingLogs, setMatchingLogs] = useState<MatchingLog[]>([]);
  const [matchingStats, setMatchingStats] = useState<MatchingStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [nonD1GameIds, setNonD1GameIds] = useState<Set<string>>(new Set());
  
  // Overrides
  const [overrides, setOverrides] = useState<TeamOverride[]>([]);
  const [kenpomTeams, setKenpomTeams] = useState<string[]>([]);
  const [oddsApiTeams, setOddsApiTeams] = useState<string[]>([]);
  const [torvikTeams, setTorvikTeams] = useState<string[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  
  // Schedule
  const [scheduleGames, setScheduleGames] = useState<ScheduleGame[]>([]);
  const [combinedScheduleGames, setCombinedScheduleGames] = useState<CombinedScheduleGame[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [oddsLoading, setOddsLoading] = useState(false);
  const [oddsError, setOddsError] = useState<string | null>(null);
  
  // History
  const [historyGames, setHistoryGames] = useState<HistoryGame[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Barttorvik
  const [btGames, setBtGames] = useState<BTGame[]>([]);
  const [btRatings, setBtRatings] = useState<BTRating[]>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  
  // Check if running locally
  useEffect(() => {
    setIsLocalhost(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  }, []);
  
  // Load team logos
  const loadTeamLogos = useCallback(async () => {
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
  }, []);
  
  // Get logo URL for a team name
  const getTeamLogo = useCallback((teamName: string): string | null => {
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
      for (let i = words.length - 1; i >= 1; i--) {
        const partial = words.slice(0, i).join(' ');
        if (teamLogos[partial]) return teamLogos[partial];
        
        const partialWithState = partial.replace(/\bst\b/g, 'state');
        if (teamLogos[partialWithState]) return teamLogos[partialWithState];
      }
      
      if (!words.includes('st') && !words.includes('state')) {
        if (teamLogos[words[0]]) return teamLogos[words[0]];
      }
      
      const twoWords = words.slice(0, 2).join(' ');
      if (teamLogos[twoWords]) return teamLogos[twoWords];
    }
    
    return null;
  }, [teamLogos, espnNameMap]);
  
  // Load ratings
  const loadRatings = useCallback(async () => {
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
  }, []);
  
  // Load matching logs
  const loadMatchingLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
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
  }, []);
  
  // Load overrides
  const loadOverrides = useCallback(async () => {
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
  }, []);
  
  // Load schedule
  const loadSchedule = useCallback(async () => {
    setScheduleLoading(true);
    setOddsLoading(false);
    setOddsError(null);
    
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const cacheBuster = Date.now();
      
      // Fetch BT schedule
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
      } else {
        const btRes = await fetch('/api/ratings/bt-schedule');
        const btData = await btRes.json();
        btGamesRaw = btData.success ? (btData.data || []) : [];
      }
      
      // Load overrides if needed
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
      
      // Build initial combined games
      const initialCombinedGames: CombinedScheduleGame[] = btGamesRaw.map((bt) => {
        const dateInfo = getDateInfo(bt.gameDate);
        
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
          oddsGameId: null,
          spread: null,
          openingSpread: null,
          total: null,
          spreadBookmaker: null,
          hasStarted: false,
          isFrozen: false,
          ...dateInfo,
        };
      });
      
      // Sort by date then time
      initialCombinedGames.sort((a, b) => {
        const dateCompare = a.gameDate.localeCompare(b.gameDate);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeToMinutes(a.gameTime) - parseTimeToMinutes(b.gameTime);
      });
      
      setCombinedScheduleGames(initialCombinedGames);
      setScheduleLoading(false);
      
      // Fetch odds in background
      setOddsLoading(true);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const oddsRes = await fetch(
          `/api/ratings/schedule?timezone=${encodeURIComponent(timezone)}&_t=${cacheBuster}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        
        const oddsData = await oddsRes.json();
        
        if (oddsData.success && oddsData.games) {
          const oddsGames: ScheduleGame[] = oddsData.games;
          setScheduleGames(oddsGames);
          
          // Build override lookup
          const torvikToOddsApi: Record<string, string> = {};
          for (const override of currentOverrides) {
            if (override.torvikName && override.oddsApiName) {
              torvikToOddsApi[override.torvikName.toLowerCase()] = override.oddsApiName.toLowerCase();
            }
          }
          
          // Find matching odds game
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
              
              if (teamsMatch(btHome, oddsGame.homeTeam) && teamsMatch(btAway, oddsGame.awayTeam)) {
                return oddsGame;
              }
            }
            
            return null;
          };
          
          // Merge odds into games
          let enrichedGames = initialCombinedGames.map(game => {
            const oddsMatch = findOddsMatch(game.homeTeam, game.awayTeam);
            const timeBasedStarted = hasGameStarted(game.gameTime, game.isToday);
            
            if (oddsMatch) {
              const started = oddsMatch.hasStarted || timeBasedStarted;
              return {
                ...game,
                oddsGameId: oddsMatch.id,
                spread: oddsMatch.spread,
                openingSpread: oddsMatch.openingSpread,
                total: oddsMatch.total,
                spreadBookmaker: oddsMatch.spreadBookmaker,
                hasStarted: started,
                isFrozen: oddsMatch.isFrozen || started,
              };
            }
            
            if (timeBasedStarted) {
              return { ...game, hasStarted: true, isFrozen: true };
            }
            
            return game;
          });
          
          // Try closing lines for games needing them
          const gamesNeedingClosingLines = enrichedGames.filter(g => 
            g.isToday && (g.oddsGameId === null || (g.hasStarted && g.spread === null))
          );
          
          if (gamesNeedingClosingLines.length > 0) {
            try {
              const now = new Date();
              const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
              const todayStr = `${eastern.getFullYear()}-${String(eastern.getMonth() + 1).padStart(2, '0')}-${String(eastern.getDate()).padStart(2, '0')}`;
              
              const closingRes = await fetch(`/api/ratings/closing-lines?date=${todayStr}`);
              const closingData = await closingRes.json();
              
              if (closingData.success && closingData.data) {
                const closingLines = closingData.data;
                
                enrichedGames = enrichedGames.map(game => {
                  const needsClosingLine = game.isToday && 
                    (game.oddsGameId === null || (game.hasStarted && game.spread === null));
                  
                  if (needsClosingLine) {
                    // Find matching closing line
                    for (const cl of closingLines) {
                      const oddsHomeOverride = torvikToOddsApi[game.homeTeam.toLowerCase()];
                      const oddsAwayOverride = torvikToOddsApi[game.awayTeam.toLowerCase()];
                      
                      let matched = false;
                      if (oddsHomeOverride && oddsAwayOverride) {
                        const clHomeLower = cl.homeTeam.toLowerCase();
                        const clAwayLower = cl.awayTeam.toLowerCase();
                        if ((clHomeLower.includes(oddsHomeOverride) || oddsHomeOverride.includes(clHomeLower)) &&
                            (clAwayLower.includes(oddsAwayOverride) || oddsAwayOverride.includes(clAwayLower))) {
                          matched = true;
                        }
                      }
                      
                      if (!matched && teamsMatch(game.homeTeam, cl.homeTeam) && teamsMatch(game.awayTeam, cl.awayTeam)) {
                        matched = true;
                      }
                      
                      if (matched) {
                        return {
                          ...game,
                          oddsGameId: cl.gameId || game.oddsGameId,
                          spread: cl.closingSpread,
                          openingSpread: cl.openingSpread || cl.closingSpread,
                          total: cl.total || game.total,
                          spreadBookmaker: cl.closingSource,
                          hasStarted: true,
                          isFrozen: true,
                        };
                      }
                    }
                  }
                  return game;
                });
              }
            } catch (closingErr) {
              console.error('Failed to fetch closing lines:', closingErr);
            }
          }
          
          setCombinedScheduleGames(enrichedGames);
          setOddsLoading(false);
        } else {
          setOddsLoading(false);
          setOddsError('No odds data returned');
        }
      } catch (err) {
        console.error('Failed to load odds data:', err);
        setOddsLoading(false);
        setOddsError(err instanceof Error ? err.message : 'Failed to load odds');
      }
      
    } catch (err) {
      console.error('Failed to load schedule:', err);
      setScheduleLoading(false);
    }
  }, [btGames, overrides]);
  
  // Load history
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const allGames: HistoryGame[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const response = await fetch(`/api/ratings/schedule/history?limit=${batchSize}&offset=${offset}`);
        const data = await response.json();
        
        if (data.success && data.games && data.games.length > 0) {
          const games: HistoryGame[] = data.games.map((g: {
            id: string;
            commenceTime: string;
            homeTeam: string;
            awayTeam: string;
            projectedSpread: number | null;
            openingSpread: number | null;
            btSpread: number | null;
            spread: number | null;
            spreadBookmaker: string | null;
          }) => ({
            id: g.id,
            gameDate: g.commenceTime,
            homeTeam: g.homeTeam,
            awayTeam: g.awayTeam,
            projectedSpread: g.projectedSpread,
            openingSpread: g.openingSpread,
            btSpread: g.btSpread,
            closingSpread: g.spread,
            closingSource: g.spreadBookmaker,
            difference: g.projectedSpread !== null && g.spread !== null 
              ? Math.round((g.spread - g.projectedSpread) * 100) / 100
              : null,
          }));
          allGames.push(...games);
          offset += batchSize;
          
          if (data.games.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
      
      setHistoryGames(allGames);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  
  // Load Barttorvik data
  const loadBarttorvik = useCallback(async () => {
    setBtLoading(true);
    setBtError(null);
    
    try {
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
      
      // Build lookup maps
      const torvikToOddsApi: Record<string, string> = {};
      if (overridesData.success && overridesData.overrides) {
        for (const override of overridesData.overrides) {
          if (override.torvik_name && override.odds_api_name) {
            torvikToOddsApi[override.torvik_name.toLowerCase()] = override.odds_api_name;
          }
        }
      }
      
      const marketGames = oddsData.success ? (oddsData.games || []) : scheduleGames;
      
      if (oddsData.success && oddsData.games) {
        setScheduleGames(oddsData.games);
      }
      
      if (scheduleData.success) {
        const btGamesData = scheduleData.data || [];
        
        const matchedGames = btGamesData.map((btGame: BTGame) => {
          const homeOddsApiName = torvikToOddsApi[btGame.home_team.toLowerCase()];
          const awayOddsApiName = torvikToOddsApi[btGame.away_team.toLowerCase()];
          
          const btHomeNorm = homeOddsApiName 
            ? normalizeTeamName(homeOddsApiName) 
            : normalizeTeamName(btGame.home_team);
          const btAwayNorm = awayOddsApiName 
            ? normalizeTeamName(awayOddsApiName) 
            : normalizeTeamName(btGame.away_team);
          
          const matchedMarket = marketGames.find((market: ScheduleGame) => {
            const marketHomeNorm = normalizeTeamName(market.homeTeam);
            const marketAwayNorm = normalizeTeamName(market.awayTeam);
            
            if (homeOddsApiName && market.homeTeam.toLowerCase().includes(homeOddsApiName.toLowerCase())) {
              if (awayOddsApiName && market.awayTeam.toLowerCase().includes(awayOddsApiName.toLowerCase())) {
                return true;
              }
            }
            
            const homeMatch = btHomeNorm.includes(marketHomeNorm) || 
                             marketHomeNorm.includes(btHomeNorm) ||
                             btHomeNorm === marketHomeNorm;
            const awayMatch = btAwayNorm.includes(marketAwayNorm) || 
                             marketAwayNorm.includes(btAwayNorm) ||
                             btAwayNorm === marketAwayNorm;
            
            return homeMatch && awayMatch;
          });
          
          if (matchedMarket) {
            return { ...btGame, spread: matchedMarket.spread, total: matchedMarket.total };
          }
          
          return btGame;
        });
        
        setBtGames(matchedGames);
      }
      
      if (ratingsData.success) {
        setBtRatings(ratingsData.data || []);
      }
      
      if (scheduleData.note || ratingsData.note) {
        setBtError(scheduleData.note || ratingsData.note);
      }
    } catch (err) {
      console.error('Failed to load Barttorvik data:', err);
      setBtError('Failed to load Barttorvik data');
    } finally {
      setBtLoading(false);
    }
  }, [scheduleGames]);
  
  // Calculate ratings
  const calculateRatings = useCallback(async (params: {
    startDate?: string;
    endDate?: string;
    maxGames?: number;
  }) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      const requestBody: Record<string, unknown> = {
        hca,
        closingSource,
        maxGames: params.maxGames || 100,
      };
      
      if (params.startDate) requestBody.startDate = params.startDate;
      if (params.endDate) requestBody.endDate = params.endDate;
      
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
      
      await loadMatchingLogs();
      
      const newGames = data.summary?.newGamesProcessed || data.summary?.gamesProcessed || 0;
      const skipped = data.summary?.gamesSkipped || 0;
      const dateRangeText = params.startDate || params.endDate 
        ? ` (${params.startDate || 'start'} to ${params.endDate || 'today'})`
        : '';
      setSuccessMessage(`Sync complete${dateRangeText}! ${newGames} games processed, ${skipped} skipped.`);
      setTimeout(() => setSuccessMessage(null), 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [hca, closingSource, loadMatchingLogs]);
  
  // Recalculate ratings
  const recalculateRatings = useCallback(async () => {
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
      
      await loadRatings();
      
      setSuccessMessage(`Recalculation complete! ${data.gamesProcessed} games replayed.`);
      setTimeout(() => setSuccessMessage(null), 10000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [hca, loadRatings]);
  
  // Mark as non-D1
  const markAsNonD1 = useCallback(async (log: MatchingLog) => {
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
  }, []);
  
  // Sync Torvik teams
  const syncTorvikTeams = useCallback(async () => {
    setBtLoading(true);
    setBtError(null);
    
    try {
      const response = await fetch('/api/ratings/barttorvik?type=ratings&syncTeams=true&refresh=true');
      const data = await response.json();
      
      if (data.success) {
        setBtRatings(data.data || []);
        setSuccessMessage(`Synced ${data.teamsSynced || 0} Torvik team names to database`);
        setTimeout(() => setSuccessMessage(null), 5000);
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
  }, [loadOverrides]);
  
  // Clear messages
  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);
  
  // Load initial data
  useEffect(() => {
    loadRatings();
    loadTeamLogos();
  }, [loadRatings, loadTeamLogos]);
  
  return {
    // Core state
    loading,
    error,
    successMessage,
    snapshot,
    syncRange,
    
    // Config
    hca,
    setHca,
    closingSource,
    setClosingSource,
    
    // Localhost
    isLocalhost,
    
    // Team logos
    teamLogos,
    espnNameMap,
    getTeamLogo,
    
    // Matching logs
    matchingLogs,
    matchingStats,
    logsLoading,
    nonD1GameIds,
    
    // Overrides
    overrides,
    kenpomTeams,
    oddsApiTeams,
    torvikTeams,
    overridesLoading,
    
    // Schedule
    scheduleGames,
    combinedScheduleGames,
    scheduleLoading,
    oddsLoading,
    oddsError,
    
    // History
    historyGames,
    historyLoading,
    
    // Barttorvik
    btGames,
    btRatings,
    btLoading,
    btError,
    
    // Actions
    loadRatings,
    loadMatchingLogs,
    loadOverrides,
    loadSchedule,
    loadHistory,
    loadBarttorvik,
    calculateRatings,
    recalculateRatings,
    markAsNonD1,
    syncTorvikTeams,
    setError,
    setSuccessMessage,
    clearMessages,
  };
}
