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

type TabType = 'ratings' | 'matching' | 'overrides';

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
  
  // Overrides state
  const [overrides, setOverrides] = useState<TeamOverride[]>([]);
  const [kenpomTeams, setKenpomTeams] = useState<string[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TeamOverride | null>(null);
  const [newOverride, setNewOverride] = useState({ sourceName: '', kenpomName: '', notes: '' });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [kenpomSearch, setKenpomSearch] = useState('');
  const [showKenpomDropdown, setShowKenpomDropdown] = useState(false);
  
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
  const [sortBy, setSortBy] = useState<'rating' | 'name' | 'games' | 'change'>('rating');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [logFilter, setLogFilter] = useState<'all' | 'success' | 'failed'>('all');
  
  // Load existing ratings on mount
  useEffect(() => {
    loadRatings();
  }, []);
  
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
      const response = await fetch('/api/ratings/calculate?logs=true');
      const data: CalculateResponse = await response.json();
      
      if (data.success) {
        setMatchingLogs(data.matchingLogs || []);
        setMatchingStats(data.matchingStats || null);
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

  // Load data when switching tabs
  useEffect(() => {
    if (activeTab === 'matching' && matchingLogs.length === 0) {
      loadMatchingLogs();
    }
    if (activeTab === 'overrides' && overrides.length === 0) {
      loadOverrides();
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

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Override management
  const openAddOverrideModal = async (sourceName?: string) => {
    setEditingOverride(null);
    setNewOverride({ sourceName: sourceName || '', kenpomName: '', notes: '' });
    setKenpomSearch('');
    setShowKenpomDropdown(false);
    setOverrideError(null);
    setShowOverrideModal(true);
    
    // Ensure kenpomTeams are loaded
    if (kenpomTeams.length === 0) {
      try {
        const response = await fetch('/api/ratings/overrides');
        const data = await response.json();
        if (data.success) {
          setKenpomTeams(data.kenpomTeams || []);
        }
      } catch (err) {
        console.error('Failed to load kenpom teams:', err);
      }
    }
  };

  const openEditOverrideModal = (override: TeamOverride) => {
    setEditingOverride(override);
    setNewOverride({ 
      sourceName: override.sourceName, 
      kenpomName: override.kenpomName, 
      notes: override.notes || '' 
    });
    setKenpomSearch(override.kenpomName);
    setShowKenpomDropdown(false);
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
      }
      return sortDir === 'desc' ? comparison : -comparison;
    }) || [];

  // Filter matching logs
  const filteredLogs = useMemo(() => {
    let logs = matchingLogs;
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
  }, [matchingLogs, logFilter, searchTerm]);
  
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
    <div className="min-h-screen bg-gray-50 text-gray-900">
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
        {/* Configuration Panel */}
        <div className="bg-white rounded-xl p-6 mb-6 border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Home Court Advantage</label>
              <input
                type="number"
                value={hca}
                onChange={(e) => setHca(parseFloat(e.target.value) || 0)}
                step="0.5"
                min="0"
                max="10"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Points added to home team projection</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Closing Line Source</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                {CLOSING_LINE_SOURCES.map((source) => (
                  <button
                    key={source.value}
                    onClick={() => setClosingSource(source.value)}
                    className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                      closingSource === source.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max Games</label>
              <input
                type="number"
                value={maxGames}
                onChange={(e) => setMaxGames(parseInt(e.target.value) || 100)}
                min="1"
                max="500"
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum games to process per sync</p>
            </div>
          </div>
          
          {/* Date Range Sync */}
          <div className="border-t border-gray-200 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Date Range Sync</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Leave dates empty to sync all unprocessed games. Season starts Nov 4, 2025.
            </p>
          </div>
          
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
                {syncRange?.firstGameDate && syncRange?.lastGameDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Date range:</span>
                    <span className="text-gray-700">
                      {new Date(syncRange.firstGameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {' → '}
                      {new Date(syncRange.lastGameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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
                Team Ratings
              </button>
              <button
                onClick={() => setActiveTab('matching')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'matching' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Matching Log
                {matchingStats && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                    matchingStats.success === matchingStats.total ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {matchingStats.success}/{matchingStats.total}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('overrides')}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overrides' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Team Overrides
                {overrides.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                    {overrides.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* Ratings Tab */}
          {activeTab === 'ratings' && snapshot && snapshot.ratings.length > 0 && (
            <>
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Team Ratings</h2>
                  <p className="text-sm text-gray-500">Click a team to see game details</p>
                </div>
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm w-64"
                />
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-8"></th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Rank</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => toggleSort('name')}>
                        Team {sortBy === 'name' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Conf</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => toggleSort('rating')}>
                        Rating {sortBy === 'rating' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Initial</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => toggleSort('change')}>
                        Change {sortBy === 'change' && (sortDir === 'desc' ? '↓' : '↑')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => toggleSort('games')}>
                        Games {sortBy === 'games' && (sortDir === 'desc' ? '↓' : '↑')}
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
                      
                      return (
                        <React.Fragment key={team.teamName}>
                          <tr 
                            className={`hover:bg-gray-50 transition-colors ${hasGames ? 'cursor-pointer' : ''} ${isExpanded ? 'bg-blue-50' : ''}`}
                            onClick={() => hasGames && toggleTeamExpanded(team.teamName)}
                          >
                            <td className="px-4 py-3 text-sm text-gray-400">
                              {hasGames && <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">{rank}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">{team.teamName}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{team.conference || '-'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-mono font-semibold ${team.rating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatRating(team.rating)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-400 font-mono">{formatRating(team.initialRating)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-mono ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                                {change > 0 ? '+' : ''}{change.toFixed(2)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-500">{team.gamesProcessed}</td>
                          </tr>
                          
                          {isExpanded && hasGames && (
                            <tr>
                              <td colSpan={8} className="bg-gray-50 px-4 py-0">
                                <div className="py-3 pl-8 pr-4">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-xs text-gray-500 uppercase">
                                        <th className="text-left py-2">Date</th>
                                        <th className="text-left py-2">Opponent</th>
                                        <th className="text-right py-2">Proj</th>
                                        <th className="text-right py-2">Close</th>
                                        <th className="text-right py-2">Before</th>
                                        <th className="text-right py-2">After</th>
                                        <th className="text-right py-2">Impact</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                      {teamGames.map((adj) => {
                                        const details = getTeamGameDetails(adj, team.teamName);
                                        return (
                                          <tr key={adj.gameId} className="hover:bg-gray-100">
                                            <td className="py-2 text-gray-600">{new Date(adj.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                                            <td className="py-2">
                                              <span className="text-gray-500 mr-1">{details.location}</span>
                                              <span className="text-gray-900">{details.opponent}</span>
                                              {adj.isNeutralSite && <span className="ml-1 text-xs text-amber-600">(N)</span>}
                                            </td>
                                            <td className="py-2 text-right font-mono text-gray-500">{formatSpread(adj.projectedSpread)}</td>
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
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Source</th>
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
                          <td className="px-4 py-3 text-sm text-gray-500">{override.source}</td>
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
            <p className="text-gray-500 mb-6">Click &ldquo;Calculate Ratings&rdquo; to generate market-adjusted power ratings.</p>
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
