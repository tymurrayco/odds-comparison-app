// src/app/ratings/components/AdminTabs.tsx
// Combined admin-only tabs: Matching Logs, Overrides, Barttorvik
// These are localhost-only and tightly coupled, so keeping together for simplicity

'use client';

import React, { useMemo, useState, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { formatSpread } from '@/lib/ratings/engine';
import type { 
  MatchingLog, 
  MatchingStats, 
  TeamOverride, 
  BTGame, 
  BTRating,
  LogFilter,
} from '../types';

// ============== MATCHING LOGS TAB ==============

interface MatchingLogsTabProps {
  matchingLogs: MatchingLog[];
  matchingStats: MatchingStats | null;
  logsLoading: boolean;
  nonD1GameIds: Set<string>;
  markAsNonD1: (log: MatchingLog) => Promise<void>;
  openAddOverrideModal: (sourceName?: string, oddsApiName?: string) => void;
}

export function MatchingLogsTab({
  matchingLogs,
  matchingStats,
  logsLoading,
  nonD1GameIds,
  markAsNonD1,
  openAddOverrideModal,
}: MatchingLogsTabProps) {
  const [logFilter, setLogFilter] = useState<LogFilter>('failed');
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredLogs = useMemo(() => {
    let logs = [...matchingLogs];
    
    // Filter by status
    if (logFilter === 'success') {
      logs = logs.filter(l => l.status === 'success');
    } else if (logFilter === 'failed') {
      logs = logs.filter(l => l.status !== 'success' && !nonD1GameIds.has(l.gameId));
    }
    
    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      logs = logs.filter(l =>
        l.espnHome.toLowerCase().includes(search) ||
        l.espnAway.toLowerCase().includes(search) ||
        l.matchedHome?.toLowerCase().includes(search) ||
        l.matchedAway?.toLowerCase().includes(search)
      );
    }
    
    return logs;
  }, [matchingLogs, logFilter, searchTerm, nonD1GameIds]);

  return (
    <>
      {matchingStats && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-900">Total:</span>
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
          <span className="text-sm text-gray-900">Filter:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {(['all', 'success', 'failed'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className={`px-3 py-1 text-sm font-medium ${logFilter === filter ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
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
        <div className="p-8 text-center text-gray-900">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">ESPN Teams</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Matched To</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-900 uppercase">Spread</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.map((log) => (
                <tr key={log.gameId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
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
                  <td className="px-4 py-3 text-right text-sm font-mono text-gray-900">
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
                          >
                            Map Home
                          </button>
                          <span className="text-gray-400">|</span>
                          <button
                            onClick={() => openAddOverrideModal(log.espnAway, '')}
                            className="text-orange-600 hover:text-orange-800 font-medium"
                          >
                            Map Away
                          </button>
                        </div>
                        <button
                          onClick={() => markAsNonD1(log)}
                          className="text-gray-900 hover:text-gray-900 text-xs"
                        >
                          Mark Non-D1
                        </button>
                      </div>
                    )}
                    {log.status === 'no_spread' && (
                      <button
                        onClick={() => markAsNonD1(log)}
                        className="text-gray-900 hover:text-gray-900 text-xs"
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
  );
}

// ============== OVERRIDES TAB ==============

interface OverridesTabProps {
  overrides: TeamOverride[];
  kenpomTeams: string[];
  oddsApiTeams: string[];
  torvikTeams: string[];
  overridesLoading: boolean;
  loadOverrides: () => Promise<void>;
  loadMatchingLogs: () => Promise<void>;
  loadRatings: () => Promise<void>;
  setSuccessMessage: (msg: string | null) => void;
}

export function OverridesTab({
  overrides,
  kenpomTeams,
  overridesLoading,
  loadOverrides,
  loadMatchingLogs,
  loadRatings,
  setSuccessMessage,
}: OverridesTabProps) {
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TeamOverride | null>(null);
  const [newOverride, setNewOverride] = useState({ sourceName: '', kenpomName: '', espnName: '', oddsApiName: '', torvikName: '', notes: '' });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [kenpomSearch, setKenpomSearch] = useState('');
  const [showKenpomDropdown, setShowKenpomDropdown] = useState(false);
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  
  const debouncedKenpomSearch = useDebounce(kenpomSearch, 150);

  const inlineSourceNameRef = useRef<HTMLInputElement>(null);
  const inlineKenpomNameRef = useRef<HTMLInputElement>(null);
  const inlineEspnNameRef = useRef<HTMLInputElement>(null);
  const inlineOddsApiRef = useRef<HTMLInputElement>(null);
  const inlineTorvikRef = useRef<HTMLInputElement>(null);
  const inlineNotesRef = useRef<HTMLInputElement>(null);

  const filteredKenpomTeams = useMemo(() => {
    if (!debouncedKenpomSearch || debouncedKenpomSearch.length < 1) return [];
    const search = debouncedKenpomSearch.toLowerCase().trim();
    const startsWithMatches = kenpomTeams.filter(t => t.toLowerCase().startsWith(search));
    const containsMatches = kenpomTeams.filter(t => !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search));
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [kenpomTeams, debouncedKenpomSearch]);

  const openAddOverrideModal = (sourceName?: string, oddsApiName?: string) => {
    setEditingOverride(null);
    setNewOverride({ sourceName: sourceName || '', kenpomName: '', espnName: '', oddsApiName: oddsApiName || '', torvikName: '', notes: '' });
    setKenpomSearch('');
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
      
      if (data.gamesProcessed > 0) {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}". ${data.gamesProcessed} game(s) processed automatically!`);
      } else {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}".`);
      }
      setTimeout(() => setSuccessMessage(null), 10000);
      
      await Promise.all([loadOverrides(), loadMatchingLogs(), loadRatings()]);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  const deleteOverride = async (id: number) => {
    if (!confirm('Are you sure you want to delete this override?')) return;
    try {
      const response = await fetch(`/api/ratings/overrides?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) loadOverrides();
    } catch (err) {
      console.error('Failed to delete override:', err);
    }
  };

  const startInlineEdit = (override: TeamOverride) => {
    setInlineEditId(override.id!);
    setTimeout(() => {
      if (inlineSourceNameRef.current) inlineSourceNameRef.current.value = override.sourceName;
      if (inlineKenpomNameRef.current) inlineKenpomNameRef.current.value = override.kenpomName;
      if (inlineEspnNameRef.current) inlineEspnNameRef.current.value = override.espnName || '';
      if (inlineOddsApiRef.current) inlineOddsApiRef.current.value = override.oddsApiName || '';
      if (inlineTorvikRef.current) inlineTorvikRef.current.value = override.torvikName || '';
      if (inlineNotesRef.current) inlineNotesRef.current.value = override.notes || '';
    }, 0);
  };

  const saveInlineEdit = async () => {
    if (!inlineEditId) return;
    const editValues = {
      sourceName: inlineSourceNameRef.current?.value || '',
      kenpomName: inlineKenpomNameRef.current?.value || '',
      espnName: inlineEspnNameRef.current?.value || '',
      oddsApiName: inlineOddsApiRef.current?.value || '',
      torvikName: inlineTorvikRef.current?.value || '',
      notes: inlineNotesRef.current?.value || '',
    };
    if (!editValues.sourceName || !editValues.kenpomName) return;

    try {
      const response = await fetch('/api/ratings/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inlineEditId, ...editValues }),
      });
      const data = await response.json();
      if (data.success) {
        setInlineEditId(null);
        loadOverrides();
      }
    } catch (err) {
      console.error('Failed to save inline edit:', err);
    }
  };

  return (
    <>
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team Name Overrides</h2>
          <p className="text-sm text-gray-900">Manual mappings for team names across data sources</p>
        </div>
        <button
          onClick={() => openAddOverrideModal()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          Add Override
        </button>
      </div>

      {overridesLoading ? (
        <div className="p-8 text-center text-gray-900">Loading...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Source Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">KenPom</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">ESPN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Odds API</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Torvik</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-900 uppercase">Notes</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-900 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {overrides.map((override) => (
                <tr key={override.id} className="hover:bg-gray-50">
                  {inlineEditId === override.id ? (
                    <>
                      <td className="px-4 py-2"><input ref={inlineSourceNameRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2"><input ref={inlineKenpomNameRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2"><input ref={inlineEspnNameRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2"><input ref={inlineOddsApiRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2"><input ref={inlineTorvikRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2"><input ref={inlineNotesRef} className="w-full px-2 py-1 border rounded text-sm" /></td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={saveInlineEdit} className="text-green-600 hover:text-green-800 text-sm mr-2">Save</button>
                        <button onClick={() => setInlineEditId(null)} className="text-gray-600 hover:text-gray-800 text-sm">Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm text-gray-900">{override.sourceName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{override.kenpomName}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{override.espnName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{override.oddsApiName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{override.torvikName || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{override.notes || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => startInlineEdit(override)} className="text-blue-600 hover:text-blue-800 text-sm mr-2">Edit</button>
                        <button onClick={() => deleteOverride(override.id!)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingOverride ? 'Edit Override' : 'Add Override'}
            </h3>
            
            {overrideError && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{overrideError}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Source Name (ESPN)</label>
                <input
                  type="text"
                  value={newOverride.sourceName}
                  onChange={(e) => setNewOverride({ ...newOverride, sourceName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Massachusetts Minutemen"
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-900 mb-1">KenPom Name</label>
                <input
                  type="text"
                  value={kenpomSearch || newOverride.kenpomName}
                  onChange={(e) => {
                    setKenpomSearch(e.target.value);
                    setShowKenpomDropdown(true);
                  }}
                  onFocus={() => setShowKenpomDropdown(true)}
                  onBlur={() => setTimeout(() => setShowKenpomDropdown(false), 200)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Search KenPom team..."
                />
                {showKenpomDropdown && filteredKenpomTeams.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredKenpomTeams.map(team => (
                      <button
                        key={team}
                        onMouseDown={() => {
                          setNewOverride({ ...newOverride, kenpomName: team });
                          setKenpomSearch('');
                          setShowKenpomDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm"
                      >
                        {team}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Odds API Name</label>
                <input
                  type="text"
                  value={newOverride.oddsApiName}
                  onChange={(e) => setNewOverride({ ...newOverride, oddsApiName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Massachusetts"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Torvik Name</label>
                <input
                  type="text"
                  value={newOverride.torvikName}
                  onChange={(e) => setNewOverride({ ...newOverride, torvikName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., UMass"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={saveOverride}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingOverride ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============== BARTTORVIK TAB ==============

interface BarttovikTabProps {
  btGames: BTGame[];
  btRatings: BTRating[];
  btLoading: boolean;
  btError: string | null;
  loadBarttorvik: () => Promise<void>;
  syncTorvikTeams: () => Promise<void>;
}

export function BarttovikTab({
  btGames,
  btRatings,
  btLoading,
  btError,
  loadBarttorvik,
  syncTorvikTeams,
}: BarttovikTabProps) {
  const [btView, setBtView] = useState<'schedule' | 'ratings'>('schedule');
  const [btSearchTerm, setBtSearchTerm] = useState('');

  const sortedBtGames = useMemo(() => {
    if (!btSearchTerm) return btGames;
    const search = btSearchTerm.toLowerCase();
    return btGames.filter(g => 
      g.home_team.toLowerCase().includes(search) || 
      g.away_team.toLowerCase().includes(search)
    );
  }, [btGames, btSearchTerm]);

  const sortedBtRatings = useMemo(() => {
    if (!btSearchTerm) return btRatings;
    const search = btSearchTerm.toLowerCase();
    return btRatings.filter(r => 
      r.team.toLowerCase().includes(search) || 
      r.conf.toLowerCase().includes(search)
    );
  }, [btRatings, btSearchTerm]);

  return (
    <>
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            <button
              onClick={() => setBtView('schedule')}
              className={`px-4 py-2 text-sm font-medium ${btView === 'schedule' ? 'bg-purple-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
            >
              Schedule ({btGames.length})
            </button>
            <button
              onClick={() => setBtView('ratings')}
              className={`px-4 py-2 text-sm font-medium ${btView === 'ratings' ? 'bg-purple-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
            >
              Ratings ({btRatings.length})
            </button>
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={btSearchTerm}
            onChange={(e) => setBtSearchTerm(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-48"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBarttorvik}
            disabled={btLoading}
            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium"
          >
            {btLoading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={syncTorvikTeams}
            disabled={btLoading}
            className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
          >
            Sync Teams
          </button>
        </div>
      </div>

      {btError && (
        <div className="p-4 bg-yellow-50 border-b border-yellow-100 text-yellow-800 text-sm">
          ⚠️ {btError}
        </div>
      )}

      {btLoading ? (
        <div className="p-8 text-center text-gray-900">Loading Barttorvik data...</div>
      ) : btView === 'schedule' ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Away</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Home</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">BT Spread</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">Market</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedBtGames.map((game, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{game.time}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{game.away_team}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{game.home_team}</td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-purple-600">
                    {game.predicted_spread != null ? (game.predicted_spread > 0 ? '+' : '') + game.predicted_spread.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-gray-900">
                    {game.spread != null ? (game.spread > 0 ? '+' : '') + game.spread : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-gray-900">
                    {game.predicted_total != null ? game.predicted_total.toFixed(0) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-purple-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Rank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Team</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase">Conf</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">Record</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">AdjO</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">AdjD</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-purple-900 uppercase">Barthag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedBtRatings.map((rating) => (
                <tr key={rating.rank} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{rating.rank}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{rating.team}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{rating.conf}</td>
                  <td className="px-4 py-3 text-center text-sm text-gray-900">{rating.record}</td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-green-600">{rating.adj_o.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-red-600">{rating.adj_d.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center text-sm font-mono text-purple-600">{(rating.barthag * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
