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

type TabType = 'ratings' | 'hypotheticals' | 'schedule' | 'matching' | 'overrides';

export default function RatingsPage() {
  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RatingsSnapshot | null>(null);
  const [syncRange, setSyncRange] = useState<{ firstGameDate: string | null; lastGameDate: string | null } | null>(null);
  
  // Matching logs state
  const [matchingLogs, setMatchingLogs] = useState<MatchingLog[]>([]);
  const [matchingStats, setMatchingStats] = useState<MatchingStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [nonD1GameIds, setNonD1GameIds] = useState<Set<string>>(new Set());
  
  // Overrides state
  const [overrides, setOverrides] = useState<TeamOverride[]>([]);
  const [kenpomTeams, setKenpomTeams] = useState<string[]>([]);
  const [oddsApiTeams, setOddsApiTeams] = useState<string[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TeamOverride | null>(null);
  const [newOverride, setNewOverride] = useState({ sourceName: '', kenpomName: '', espnName: '', oddsApiName: '', notes: '' });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [kenpomSearch, setKenpomSearch] = useState('');
  const [showKenpomDropdown, setShowKenpomDropdown] = useState(false);
  const [oddsApiSearch, setOddsApiSearch] = useState('');
  const [showOddsApiDropdown, setShowOddsApiDropdown] = useState(false);
  
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
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'today' | 'tomorrow'>('all');
  
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
      // Get user's timezone and pass it to the API
      // Add timestamp to bust Vercel edge cache
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const cacheBuster = Date.now();
      const response = await fetch(`/api/ratings/schedule?timezone=${encodeURIComponent(timezone)}&_t=${cacheBuster}`);
      const data = await response.json();
      
      if (data.success) {
        setScheduleGames(data.games || []);
      }
    } catch (err) {
      console.error('Failed to load schedule:', err);
    } finally {
      setScheduleLoading(false);
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
    if (activeTab === 'matching' && matchingLogs.length === 0) {
      loadMatchingLogs();
    }
    if (activeTab === 'overrides' && overrides.length === 0) {
      loadOverrides();
    }
    if (activeTab === 'schedule') {
      if (scheduleGames.length === 0) {
        loadSchedule();
      }
      // Also load overrides for team name mapping if not already loaded
      if (overrides.length === 0) {
        loadOverrides();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  
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
    setNewOverride({ sourceName: sourceName || '', kenpomName: '', espnName: '', oddsApiName: oddsApiName || '', notes: '' });
    setKenpomSearch('');
    setShowKenpomDropdown(false);
    setOddsApiSearch('');
    setShowOddsApiDropdown(false);
    setOverrideError(null);
    setShowOverrideModal(true);
    
    // Ensure kenpomTeams and oddsApiTeams are loaded
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
  };

  const openEditOverrideModal = (override: TeamOverride) => {
    setEditingOverride(override);
    setNewOverride({ 
      sourceName: override.sourceName, 
      kenpomName: override.kenpomName,
      espnName: override.espnName || '',
      oddsApiName: override.oddsApiName || '',
      notes: override.notes || '' 
    });
    setKenpomSearch(override.kenpomName);
    setShowKenpomDropdown(false);
    setOddsApiSearch(override.oddsApiName || '');
    setShowOddsApiDropdown(false);
    setOverrideError(null);
    setShowOverrideModal(true);
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

  // Filtered KenPom teams for autocomplete
  const filteredKenpomTeams = useMemo(() => {
    if (!kenpomSearch || kenpomSearch.length < 1) return [];
    const search = kenpomSearch.toLowerCase().trim();
    
    // Prioritize teams that START with the search term
    const startsWithMatches = kenpomTeams.filter(t => 
      t.toLowerCase().startsWith(search)
    );
    
    // Then teams that CONTAIN the search term (but don't start with it)
    const containsMatches = kenpomTeams.filter(t => 
      !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search)
    );
    
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [kenpomTeams, kenpomSearch]);

  // Filtered Odds API teams for autocomplete
  const filteredOddsApiTeams = useMemo(() => {
    if (!oddsApiSearch || oddsApiSearch.length < 1) return [];
    const search = oddsApiSearch.toLowerCase().trim();
    
    // Prioritize teams that START with the search term
    const startsWithMatches = oddsApiTeams.filter(t => 
      t.toLowerCase().startsWith(search)
    );
    
    // Then teams that CONTAIN the search term (but don't start with it)
    const containsMatches = oddsApiTeams.filter(t => 
      !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search)
    );
    
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [oddsApiTeams, oddsApiSearch]);

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

  // Filter schedule games
  const filteredScheduleGames = useMemo(() => {
    if (scheduleFilter === 'today') return scheduleGames.filter(g => g.isToday);
    if (scheduleFilter === 'tomorrow') return scheduleGames.filter(g => g.isTomorrow);
    return scheduleGames;
  }, [scheduleGames, scheduleFilter]);
  
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

        {/* Date Range Sync Panel */}
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
                onClick={() => setActiveTab('hypotheticals')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hypotheticals' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Hypotheticals
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'schedule' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Schedule {scheduleGames.length > 0 && `(${scheduleGames.length})`}
              </button>
              <button
                onClick={() => setActiveTab('matching')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'matching' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Matching Logs {matchingStats && `(${matchingStats.total})`}
              </button>
              <button
                onClick={() => setActiveTab('overrides')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overrides' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Name Overrides {overrides.length > 0 && `(${overrides.length})`}
              </button>
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
                    {(['all', 'today', 'tomorrow'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setScheduleFilter(filter)}
                        className={`px-3 py-1 text-sm font-medium capitalize ${scheduleFilter === filter ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                      >
                        {filter} {filter === 'today' && scheduleGames.filter(g => g.isToday).length > 0 && `(${scheduleGames.filter(g => g.isToday).length})`}
                        {filter === 'tomorrow' && scheduleGames.filter(g => g.isTomorrow).length > 0 && `(${scheduleGames.filter(g => g.isTomorrow).length})`}
                      </button>
                    ))}
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

              {scheduleLoading ? (
                <div className="p-8 text-center text-gray-500">Loading schedule...</div>
              ) : filteredScheduleGames.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-3">📅</div>
                  <p>No games found for {scheduleFilter === 'all' ? 'today or tomorrow' : scheduleFilter}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Time</th>
                        <th className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px]">Away</th>
                        <th className="px-1 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-6"></th>
                        <th className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase min-w-[60px] sm:min-w-[120px]">Home</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Proj</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Open</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Curr</th>
                        <th className="px-1 sm:px-2 py-3 text-center text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">+/-</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap">Delta</th>
                        <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase whitespace-nowrap hidden sm:table-cell">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredScheduleGames.map((game) => {
                        const gameDate = new Date(game.commenceTime);
                        const timeStr = gameDate.toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        });
                        const dayStr = game.isToday ? 'Today' : 'Tomorrow';
                        
                        // Find team rating using overrides for Odds API name mapping
                        const findTeamRating = (oddsApiTeamName: string) => {
                          if (!snapshot?.ratings) return null;
                          
                          const searchLower = oddsApiTeamName.toLowerCase();
                          
                          // 1. Check if there's an override with this oddsApiName
                          const overrideByOddsApi = overrides.find(o => 
                            o.oddsApiName?.toLowerCase() === searchLower
                          );
                          if (overrideByOddsApi) {
                            return snapshot.ratings.find(r => r.teamName === overrideByOddsApi.kenpomName);
                          }
                          
                          // 2. Check if there's an override with this sourceName (ESPN name might match Odds API)
                          const overrideBySource = overrides.find(o => 
                            o.sourceName.toLowerCase() === searchLower
                          );
                          if (overrideBySource) {
                            return snapshot.ratings.find(r => r.teamName === overrideBySource.kenpomName);
                          }
                          
                          // 3. Try exact match on teamName in ratings
                          let rating = snapshot.ratings.find(r => r.teamName === oddsApiTeamName);
                          if (rating) return rating;
                          
                          // 4. Case-insensitive exact match on ratings teamName
                          rating = snapshot.ratings.find(r => 
                            r.teamName.toLowerCase() === searchLower
                          );
                          if (rating) return rating;
                          
                          // 5. Try matching by checking if ratings teamName is contained at START of Odds API name
                          // This handles "Duke Blue Devils" -> "Duke", "Oregon Ducks" -> "Oregon"
                          rating = snapshot.ratings.find(r => {
                            const ratingLower = r.teamName.toLowerCase();
                            // Check if Odds API name starts with the rating name followed by space
                            return searchLower.startsWith(ratingLower + ' ') || searchLower === ratingLower;
                          });
                          if (rating) return rating;
                          
                          // 6. Try stripping last word (mascot) from Odds API name and matching
                          const words = oddsApiTeamName.split(' ');
                          if (words.length > 1) {
                            // Try progressively removing words from the end
                            for (let i = words.length - 1; i >= 1; i--) {
                              const withoutMascot = words.slice(0, i).join(' ');
                              rating = snapshot.ratings.find(r => 
                                r.teamName.toLowerCase() === withoutMascot.toLowerCase()
                              );
                              if (rating) return rating;
                            }
                          }
                          
                          // 7. No match found
                          return null;
                        };
                        
                        const homeRating = findTeamRating(game.homeTeam);
                        const awayRating = findTeamRating(game.awayTeam);
                        
                        let projectedSpread: number | null = null;
                        if (homeRating && awayRating) {
                          // Spread = -(HomeRating - AwayRating + HCA)
                          projectedSpread = -((homeRating.rating - awayRating.rating) + hca);
                          projectedSpread = Math.round(projectedSpread * 100) / 100;
                        }
                        
                        // Calculate delta (absolute difference)
                        let delta: number | null = null;
                        if (projectedSpread !== null && game.spread !== null) {
                          delta = Math.abs(projectedSpread - game.spread);
                          delta = Math.round(delta * 100) / 100;
                        }
                        
                        return (
                          <tr key={game.id} className="hover:bg-gray-50">
                            <td className="px-2 sm:px-4 py-3">
                              <div className="text-xs sm:text-sm font-medium text-gray-900">{timeStr}</div>
                              <div className="text-xs text-gray-500">{dayStr}</div>
                            </td>
                            <td className="px-1 sm:px-4 py-3">
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
                                {!awayRating && <span className="text-xs text-red-400 hidden sm:inline">?</span>}
                              </div>
                            </td>
                            <td className="px-1 py-3 text-center text-gray-400">@</td>
                            <td className="px-1 sm:px-4 py-3">
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
                                {!homeRating && <span className="text-xs text-red-400 hidden sm:inline">?</span>}
                              </div>
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {projectedSpread !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold ${projectedSpread < 0 ? 'text-green-600' : projectedSpread > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {projectedSpread > 0 ? '+' : ''}{projectedSpread}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {game.openingSpread !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold ${game.openingSpread < 0 ? 'text-green-600' : game.openingSpread > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                  {game.openingSpread > 0 ? '+' : ''}{game.openingSpread}
                                </span>
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
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-1 sm:px-4 py-3 text-center">
                              {(() => {
                                // Movement indicator: is line moving toward or away from our projection?
                                if (projectedSpread === null || game.openingSpread === null || game.spread === null) {
                                  return <span className="text-gray-300">—</span>;
                                }
                                
                                // No movement
                                if (game.openingSpread === game.spread) {
                                  return <span className="text-gray-400">—</span>;
                                }
                                
                                // Calculate if movement is toward our projection
                                const openDiff = Math.abs(projectedSpread - game.openingSpread);
                                const currentDiff = Math.abs(projectedSpread - game.spread);
                                
                                if (currentDiff < openDiff) {
                                  // Moving toward our projection - good!
                                  return <span className="text-green-600 font-bold">+</span>;
                                } else {
                                  // Moving away from our projection - bad
                                  return <span className="text-red-600 font-bold">−</span>;
                                }
                              })()}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right">
                              {delta !== null ? (
                                <span className={`font-mono text-xs sm:text-sm font-semibold px-1 sm:px-2 py-1 rounded ${delta >= 3 ? 'bg-green-100' : 'bg-gray-100'}`}>
                                  {delta}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 sm:px-4 py-3 text-right hidden sm:table-cell">
                              {game.total !== null ? (
                                <span className="font-mono text-xs sm:text-sm text-gray-700">{game.total}</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
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

          {/* Matching Log Tab */}
          {activeTab === 'matching' && (
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
          {activeTab === 'overrides' && (
            <>
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Team Name Overrides</h2>
                  <p className="text-sm text-gray-500">Manual mappings from ESPN/OddsAPI names to KenPom names</p>
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
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Source Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">→</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">KenPom Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ESPN Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Odds API Name</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overrides.map((override) => (
                        <tr key={override.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{override.sourceName}</td>
                          <td className="px-4 py-3 text-gray-400">→</td>
                          <td className="px-4 py-3 text-green-700 font-medium">{override.kenpomName}</td>
                          <td className="px-4 py-3 text-sm text-blue-600">{override.espnName || '—'}</td>
                          <td className="px-4 py-3 text-sm text-orange-600">{override.oddsApiName || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{override.notes || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => openEditOverrideModal(override)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteOverride(override.id!)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
