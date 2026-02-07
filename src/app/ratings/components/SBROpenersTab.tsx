// src/app/ratings/components/SBROpenersTab.tsx
// Tab component to display SBR opener odds with inline team name mapping

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface SBRGame {
  awayTeam: string;
  homeTeam: string;
  openerSpread: number | null;
  isComplete: boolean;
  awayScore: number | null;
  homeScore: number | null;
  gameTime: string;
}

interface SBRResponse {
  date: string;
  scrapedAt: string;
  source: string;
  gameCount: number;
  games: SBRGame[];
  error?: string;
}

interface MappingResponse {
  success: boolean;
  sbrMappings: Record<string, string>; // sbr_name (lowercase) -> kenpom_name
  kenpomTeams: string[];
}

// Autocomplete dropdown component for team name mapping
function TeamMappingDropdown({
  sbrName,
  currentMapping,
  kenpomTeams,
  onSelect,
  saving,
}: {
  sbrName: string;
  currentMapping: string | null;
  kenpomTeams: string[];
  onSelect: (sbrName: string, kenpomName: string) => void;
  saving: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTeams = search
    ? kenpomTeams.filter(t => t.toLowerCase().includes(search.toLowerCase()))
    : kenpomTeams;

  if (currentMapping) {
    // Already mapped - show green checkmark with mapped name
    return (
      <div className="flex items-center gap-1 text-xs">
        <span className="text-green-600" title={`Mapped to: ${currentMapping}`}>✅</span>
        <span className="text-green-700 font-medium truncate max-w-[120px]" title={currentMapping}>
          {currentMapping}
        </span>
        <button
          onClick={() => onSelect(sbrName, '')}
          className="text-gray-400 hover:text-red-500 ml-0.5"
          title="Remove mapping"
        >
          ×
        </button>
      </div>
    );
  }

  // Unmapped - show dropdown
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        disabled={saving}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
        title="Click to map this SBR team name"
      >
        <span>⚠️</span>
        <span>Map</span>
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search team name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  setSearch('');
                }
                if (e.key === 'Enter' && filteredTeams.length === 1) {
                  onSelect(sbrName, filteredTeams[0]);
                  setIsOpen(false);
                  setSearch('');
                }
              }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredTeams.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches found</div>
            ) : (
              filteredTeams.slice(0, 50).map((team) => (
                <button
                  key={team}
                  onClick={() => {
                    onSelect(sbrName, team);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {team}
                </button>
              ))
            )}
            {filteredTeams.length > 50 && (
              <div className="px-3 py-1.5 text-xs text-gray-400 border-t">
                {filteredTeams.length - 50} more — type to narrow
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SBROpenersTab() {
  const [games, setGames] = useState<SBRGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [lastScraped, setLastScraped] = useState<string | null>(null);

  // Mapping state
  const [sbrMappings, setSbrMappings] = useState<Record<string, string>>({});
  const [kenpomTeams, setKenpomTeams] = useState<string[]>([]);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);

  // Save openers state
  const [savingOpeners, setSavingOpeners] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    gamesSent: number;
    gameAdjustments: { updated: number; skipped: number; skippedGames?: string[] };
    closingLines: { updated: number; skipped: number; skippedGames?: string[] };
    errors?: string[];
  } | null>(null);

  // Load SBR mappings on mount
  const loadMappings = useCallback(async () => {
    try {
      const res = await fetch('/api/ratings/sbr-mapping');
      const data: MappingResponse = await res.json();
      if (data.success) {
        setSbrMappings(data.sbrMappings);
        setKenpomTeams(data.kenpomTeams);
      }
    } catch (err) {
      console.error('Failed to load SBR mappings:', err);
    } finally {
      setMappingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // Save a mapping
  const saveMapping = async (sbrName: string, kenpomName: string) => {
    setSavingMapping(true);
    try {
      if (!kenpomName) {
        // Remove mapping
        const res = await fetch('/api/ratings/sbr-mapping', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sbrName }),
        });
        const data = await res.json();
        if (data.success) {
          setSbrMappings(prev => {
            const next = { ...prev };
            delete next[sbrName.toLowerCase()];
            return next;
          });
        }
      } else {
        // Add/update mapping
        const res = await fetch('/api/ratings/sbr-mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sbrName, kenpomName }),
        });
        const data = await res.json();
        if (data.success) {
          setSbrMappings(prev => ({
            ...prev,
            [sbrName.toLowerCase()]: kenpomName,
          }));
        }
      }
    } catch (err) {
      console.error('Failed to save SBR mapping:', err);
    } finally {
      setSavingMapping(false);
    }
  };

  // Get the mapped KenPom name for an SBR team name (or null if unmapped)
  const getMappedName = (sbrName: string): string | null => {
    return sbrMappings[sbrName.toLowerCase()] || null;
  };

  // Get games that are fully mapped (both teams) and have an opener
  const getReadyGames = () => {
    return games.filter(g => {
      const awayMapped = getMappedName(g.awayTeam);
      const homeMapped = getMappedName(g.homeTeam);
      return awayMapped && homeMapped && g.openerSpread !== null;
    });
  };

  const readyToSave = getReadyGames().length;

  const handleSaveOpeners = async () => {
    const readyGames = getReadyGames();
    if (readyGames.length === 0) return;

    setSavingOpeners(true);
    setSaveResult(null);

    try {
      const payload = {
        date: selectedDate,
        games: readyGames.map(g => ({
          sbrAway: g.awayTeam,
          sbrHome: g.homeTeam,
          kenpomAway: getMappedName(g.awayTeam)!,
          kenpomHome: getMappedName(g.homeTeam)!,
          openerSpread: g.openerSpread!,
          awayScore: g.awayScore,
          homeScore: g.homeScore,
        })),
      };

      const res = await fetch('/api/ratings/sbr-openers/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setSaveResult({
          gamesSent: data.gamesSent,
          gameAdjustments: data.gameAdjustments,
          closingLines: data.closingLines,
          errors: data.errors,
        });
      } else {
        setError(`Save failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Save error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSavingOpeners(false);
    }
  };

  const fetchSBROdds = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/ratings/sbr-odds?date=${selectedDate}`);
      const data: SBRResponse = await res.json();
      
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to fetch: ${res.status}`);
      }
      
      setGames(data.games || []);
      setLastScraped(data.scrapedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSBROdds();
  }, [selectedDate]);

  const formatSpread = (spread: number | null) => {
    if (spread === null || spread === undefined) return '-';
    const sign = spread > 0 ? '+' : '';
    return `${sign}${spread}`;
  };

  const changeDate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const formatDisplayDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Count mapped vs unmapped unique team names
  const uniqueSbrNames = new Set<string>();
  games.forEach(g => {
    uniqueSbrNames.add(g.awayTeam);
    uniqueSbrNames.add(g.homeTeam);
  });
  const mappedCount = [...uniqueSbrNames].filter(n => getMappedName(n) !== null).length;
  const unmappedCount = uniqueSbrNames.size - mappedCount;

  return (
    <div className="space-y-4 p-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => changeDate(-1)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-900"
          >
            ◀ Prev
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
          />
          <button 
            onClick={() => changeDate(1)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-900"
          >
            Next ▶
          </button>
          <button 
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
          >
            Today
          </button>
          <button 
            onClick={fetchSBROdds}
            disabled={loading}
            className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Syncing...' : '🔄 Sync'}
          </button>

          {/* Save Openers button */}
          {!loading && readyToSave > 0 && (
            <button
              onClick={handleSaveOpeners}
              disabled={savingOpeners}
              className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium disabled:opacity-50"
            >
              {savingOpeners ? 'Saving...' : `💾 Save Openers (${readyToSave})`}
            </button>
          )}
        </div>
      </div>

      {/* Date display + mapping stats */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          Showing: <span className="font-medium text-gray-900">{formatDisplayDate(selectedDate)}</span>
          {lastScraped && (
            <span className="ml-4 text-gray-400">
              Scraped: {new Date(lastScraped).toLocaleTimeString()}
            </span>
          )}
        </div>
        {mappingsLoaded && games.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-green-600 font-medium">✅ {mappedCount} mapped</span>
            {unmappedCount > 0 && (
              <span className="text-orange-600 font-medium">⚠️ {unmappedCount} unmapped</span>
            )}
          </div>
        )}
      </div>

      {/* Save result feedback */}
      {saveResult && (
        <div className="bg-purple-50 border border-purple-200 text-purple-700 px-4 py-3 rounded-lg text-sm">
          <div className="flex items-center justify-between">
            <div>
              <strong>Openers saved for {saveResult.gamesSent} games:</strong>
              {' '}History: {saveResult.gameAdjustments.updated} updated, {saveResult.gameAdjustments.skipped} not found
              {' · '}Schedule: {saveResult.closingLines.updated} updated, {saveResult.closingLines.skipped} not found
              {saveResult.errors && saveResult.errors.length > 0 && (
                <span className="text-red-600 ml-2">({saveResult.errors.length} errors)</span>
              )}
            </div>
            <button
              onClick={() => setSaveResult(null)}
              className="text-purple-500 hover:text-purple-700 ml-2"
            >
              ×
            </button>
          </div>
          {/* Show skipped game details */}
          {(saveResult.gameAdjustments.skippedGames || saveResult.closingLines.skippedGames) && (
            <div className="mt-2 pt-2 border-t border-purple-200 text-xs">
              {saveResult.gameAdjustments.skippedGames && saveResult.gameAdjustments.skippedGames.length > 0 && (
                <div className="mb-1">
                  <span className="font-semibold">History skipped:</span>{' '}
                  {saveResult.gameAdjustments.skippedGames.join(', ')}
                </div>
              )}
              {saveResult.closingLines.skippedGames && saveResult.closingLines.skippedGames.length > 0 && (
                <div>
                  <span className="font-semibold">Schedule skipped:</span>{' '}
                  {saveResult.closingLines.skippedGames.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="animate-pulse text-lg">Scraping SBR odds...</div>
          <p className="text-sm mt-2">This may take a few seconds</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <strong>Error:</strong> {error}
          <button 
            onClick={() => setError(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            ×
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && games.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-4xl mb-3">🏀</div>
          <p>No games found for {formatDisplayDate(selectedDate)}</p>
          <p className="text-sm mt-2">Try selecting a different date</p>
        </div>
      )}

      {/* Games table */}
      {!loading && games.length > 0 && (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Away Team
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mapping
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Home Team
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mapping
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Opener
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {games.map((game, idx) => (
                <tr 
                  key={`${game.awayTeam}-${game.homeTeam}-${idx}`} 
                  className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {game.gameTime}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {game.awayTeam}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {mappingsLoaded && (
                      <TeamMappingDropdown
                        sbrName={game.awayTeam}
                        currentMapping={getMappedName(game.awayTeam)}
                        kenpomTeams={kenpomTeams}
                        onSelect={saveMapping}
                        saving={savingMapping}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {game.homeTeam}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {mappingsLoaded && (
                      <TeamMappingDropdown
                        sbrName={game.homeTeam}
                        currentMapping={getMappedName(game.homeTeam)}
                        kenpomTeams={kenpomTeams}
                        onSelect={saveMapping}
                        saving={savingMapping}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono">
                    <span className={
                      game.openerSpread === null ? 'text-gray-400' :
                      game.openerSpread > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                    }>
                      {formatSpread(game.openerSpread)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                    {game.isComplete 
                      ? <span className="font-semibold text-gray-900">{game.awayScore}-{game.homeScore}</span>
                      : <span className="text-gray-300">-</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="px-4 py-3 bg-gray-50 text-xs text-gray-500 border-t border-gray-200 flex justify-between">
            <span>Source: sportsbookreview.com</span>
            <span>{games.length} games • Opener = Home team spread</span>
          </div>
        </div>
      )}
    </div>
  );
}
