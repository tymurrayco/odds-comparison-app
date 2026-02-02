// src/app/ratings/components/OverridesTab.tsx
'use client';

import React, { useMemo, useState, useRef } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import type { TeamOverride } from '../types';

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
  setOverrides: React.Dispatch<React.SetStateAction<TeamOverride[]>>;
  setKenpomTeams: React.Dispatch<React.SetStateAction<string[]>>;
  setOddsApiTeams: React.Dispatch<React.SetStateAction<string[]>>;
  setTorvikTeams: React.Dispatch<React.SetStateAction<string[]>>;
}

export function OverridesTab({
  overrides,
  kenpomTeams,
  oddsApiTeams,
  torvikTeams,
  overridesLoading,
  loadOverrides,
  loadMatchingLogs,
  loadRatings,
  setSuccessMessage,
  setOverrides,
  setKenpomTeams,
  setOddsApiTeams,
  setTorvikTeams,
}: OverridesTabProps) {
  // Modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [editingOverride, setEditingOverride] = useState<TeamOverride | null>(null);
  const [newOverride, setNewOverride] = useState({ sourceName: '', kenpomName: '', espnName: '', oddsApiName: '', torvikName: '', notes: '' });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [kenpomSearch, setKenpomSearch] = useState('');
  const [showKenpomDropdown, setShowKenpomDropdown] = useState(false);
  const [oddsApiSearch, setOddsApiSearch] = useState('');
  const [showOddsApiDropdown, setShowOddsApiDropdown] = useState(false);

  // Inline editing state
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineOddsApiSearch, setInlineOddsApiSearch] = useState('');
  const [showInlineOddsApiDropdown, setShowInlineOddsApiDropdown] = useState(false);
  const [inlineTorvikSearch, setInlineTorvikSearch] = useState('');
  const [showInlineTorvikDropdown, setShowInlineTorvikDropdown] = useState(false);

  // Refs for inline editing
  const inlineSourceNameRef = useRef<HTMLInputElement>(null);
  const inlineKenpomNameRef = useRef<HTMLInputElement>(null);
  const inlineEspnNameRef = useRef<HTMLInputElement>(null);
  const inlineOddsApiRef = useRef<HTMLInputElement>(null);
  const inlineTorvikRef = useRef<HTMLInputElement>(null);
  const inlineNotesRef = useRef<HTMLInputElement>(null);

  // Debounced searches
  const debouncedKenpomSearch = useDebounce(kenpomSearch, 150);
  const debouncedOddsApiSearch = useDebounce(oddsApiSearch, 150);
  const debouncedInlineOddsApiSearch = useDebounce(inlineOddsApiSearch, 150);
  const debouncedInlineTorvikSearch = useDebounce(inlineTorvikSearch, 150);

  // Filtered teams for dropdowns
  const filteredKenpomTeams = useMemo(() => {
    if (!debouncedKenpomSearch || debouncedKenpomSearch.length < 1) return [];
    const search = debouncedKenpomSearch.toLowerCase().trim();
    const startsWithMatches = kenpomTeams.filter(t => t.toLowerCase().startsWith(search));
    const containsMatches = kenpomTeams.filter(t => !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search));
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [kenpomTeams, debouncedKenpomSearch]);

  const filteredOddsApiTeams = useMemo(() => {
    if (!debouncedOddsApiSearch || debouncedOddsApiSearch.length < 1) return [];
    const search = debouncedOddsApiSearch.toLowerCase().trim();
    const startsWithMatches = oddsApiTeams.filter(t => t.toLowerCase().startsWith(search));
    const containsMatches = oddsApiTeams.filter(t => !t.toLowerCase().startsWith(search) && t.toLowerCase().includes(search));
    return [...startsWithMatches, ...containsMatches].slice(0, 15);
  }, [oddsApiTeams, debouncedOddsApiSearch]);

  const filteredInlineOddsApiTeams = useMemo(() => {
    if (!debouncedInlineOddsApiSearch || debouncedInlineOddsApiSearch.length < 1) return [];
    const search = debouncedInlineOddsApiSearch.toLowerCase().trim();
    return oddsApiTeams.filter(t => t.toLowerCase().includes(search)).slice(0, 8);
  }, [debouncedInlineOddsApiSearch, oddsApiTeams]);

  const filteredInlineTorvikTeams = useMemo(() => {
    if (!debouncedInlineTorvikSearch || debouncedInlineTorvikSearch.length < 1) return [];
    const search = debouncedInlineTorvikSearch.toLowerCase().trim();
    return torvikTeams.filter(t => t.toLowerCase().includes(search)).slice(0, 8);
  }, [debouncedInlineTorvikSearch, torvikTeams]);

  // Open add override modal
  const openAddOverrideModal = async (sourceName?: string, oddsApiName?: string) => {
    setEditingOverride(null);
    setNewOverride({ sourceName: sourceName || '', kenpomName: '', espnName: '', oddsApiName: oddsApiName || '', torvikName: '', notes: '' });
    setKenpomSearch('');
    setShowKenpomDropdown(false);
    setOddsApiSearch('');
    setShowOddsApiDropdown(false);
    setOverrideError(null);
    setShowOverrideModal(true);

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

  // Save override (add or edit)
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
      } else if (data.gamesUpdated > 0) {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}". ${data.gamesUpdated} log(s) updated.`);
      } else {
        setSuccessMessage(`Override added: "${newOverride.sourceName}" → "${newOverride.kenpomName}".`);
      }
      setTimeout(() => setSuccessMessage(null), 10000);
      
      await Promise.all([loadOverrides(), loadMatchingLogs(), loadRatings()]);
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // Delete override
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

  // Start inline editing
  const startInlineEdit = async (override: TeamOverride) => {
    setInlineEditId(override.id!);
    setInlineOddsApiSearch(override.oddsApiName || '');
    setShowInlineOddsApiDropdown(false);
    setInlineTorvikSearch(override.torvikName || '');
    setShowInlineTorvikDropdown(false);

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
        body: JSON.stringify({ id: inlineEditId, ...editValues }),
      });

      const data = await response.json();

      if (data.success) {
        setOverrides(prev => prev.map(o => 
          o.id === inlineEditId ? { ...o, ...editValues } as TeamOverride : o
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

  return (
    <>
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Team Name Overrides</h2>
          <p className="text-sm text-gray-900">Manual mappings for team names across data sources</p>
        </div>
        <button
          onClick={() => openAddOverrideModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
        >
          + Add Override
        </button>
      </div>

      {overridesLoading ? (
        <div className="p-8 text-center text-gray-900">Loading...</div>
      ) : overrides.length === 0 ? (
        <div className="p-8 text-center text-gray-900">
          No overrides yet. Add one to map unmatched team names.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase">Source</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase">KenPom</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase">ESPN</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase">Odds API</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-purple-600 uppercase">Torvik</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-900 uppercase">Notes</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 uppercase w-28">Actions</th>
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
                          className="text-gray-900 hover:text-gray-900 text-xs font-medium"
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
                      <td className="px-3 py-2 text-gray-900 truncate max-w-32">{override.notes || <span className="text-gray-300">—</span>}</td>
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
                <label className="block text-sm font-medium text-gray-900 mb-1">
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
                <label className="block text-sm font-medium text-gray-900 mb-1">
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
                  <p className="mt-1 text-sm text-gray-900">Loading teams...</p>
                )}
                {showKenpomDropdown && filteredKenpomTeams.length > 0 && (
                  <div className="mt-1 border border-gray-200 rounded-lg max-h-48 overflow-y-auto bg-white shadow-lg">
                    {filteredKenpomTeams.map((team) => (
                      <button
                        key={team}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setKenpomSearch(team);
                          setNewOverride({ ...newOverride, kenpomName: team });
                          setShowKenpomDropdown(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-b-0 ${
                          newOverride.kenpomName === team ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-900'
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
                <label className="block text-sm font-medium text-gray-900 mb-1">
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
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  ESPN Name (for logo lookup, optional)
                </label>
                <input
                  type="text"
                  value={newOverride.espnName}
                  onChange={(e) => setNewOverride({ ...newOverride, espnName: e.target.value })}
                  placeholder="e.g., UConn, NC State, Ole Miss"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-900">
                  Only needed if logo doesn&apos;t show. Use ESPN&apos;s display name.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
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
                  <p className="mt-1 text-sm text-gray-900">No Odds API teams loaded yet. Run a sync first to populate.</p>
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
                          newOverride.oddsApiName === team ? 'bg-orange-100 text-orange-700 font-medium' : 'text-gray-900'
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
                <p className="mt-1 text-xs text-gray-900">
                  Use if games fail with &quot;No Odds&quot;. Select the matching team from Odds API.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  Torvik Name (for BT schedule matching, optional)
                </label>
                <input
                  type="text"
                  value={newOverride.torvikName || ''}
                  onChange={(e) => setNewOverride({ ...newOverride, torvikName: e.target.value })}
                  placeholder="e.g., Miami OH, N.C. State, UConn"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-900">
                  Use the exact team name from Barttorvik&apos;s schedule to match with market odds.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 text-gray-900 hover:bg-gray-100 rounded-lg font-medium"
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
    </>
  );
}
