// src/app/ratings/components/HistoryTab.tsx
'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
import { TeamLogo } from './TeamLogo';
import type { HistoryGame, HistorySortField, SortDirection } from '../types';

interface HistoryTabProps {
  historyGames: HistoryGame[];
  historyLoading: boolean;
  loadHistory: () => void;
  getTeamLogo: (teamName: string) => string | null;
}

export function HistoryTab({
  historyGames,
  historyLoading,
  loadHistory,
  getTeamLogo,
}: HistoryTabProps) {
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');
  const [historyDiffMin, setHistoryDiffMin] = useState(0);
  const [historyDiffMinDisplay, setHistoryDiffMinDisplay] = useState(0);
  const [historySortField, setHistorySortField] = useState<HistorySortField>('date');
  const [historySortDirection, setHistorySortDirection] = useState<SortDirection>('desc');
  const [showValueOnly, setShowValueOnly] = useState(false);
  const [showVOpenOnly, setShowVOpenOnly] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const deferredSearch = useDeferredValue(teamSearch);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState('');

  const handleBackfill = async () => {
    if (!historyStartDate) {
      setBackfillMessage('Set a start date first');
      setTimeout(() => setBackfillMessage(''), 3000);
      return;
    }
    setBackfillLoading(true);
    setBackfillMessage('');
    try {
      // Step 1: Backfill closing lines
      setBackfillMessage('Backfilling closing lines...');
      const response = await fetch('/api/ratings/sync/backfill-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: historyStartDate }),
      });
      const data = await response.json();
      if (!data.success) {
        setBackfillMessage(`Error: ${data.error}`);
        return;
      }

      // Step 2: Recalculate ratings from the backfilled date forward
      setBackfillMessage(`Updated ${data.gamesUpdated} games, recalculating ratings...`);
      const recalcResponse = await fetch('/api/ratings/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate-from',
          fromDate: historyStartDate,
          season: 2026,
        }),
      });
      const recalcData = await recalcResponse.json();

      if (recalcData.success) {
        setBackfillMessage(`Done! ${data.gamesUpdated} lines updated, ${recalcData.gamesSaved} ratings recalculated`);
      } else {
        setBackfillMessage(`Lines updated but recalc failed: ${recalcData.error}`);
      }

      loadHistory();
    } catch (err: any) {
      setBackfillMessage(`Error: ${err.message}`);
    } finally {
      setBackfillLoading(false);
      setTimeout(() => setBackfillMessage(''), 8000);
    }
  };

  // Helper functions for highlighting
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

  // Helper to calculate line movement for sorting
  const getLineMovement = (game: HistoryGame) => {
    if (game.openingSpread === null || game.closingSpread === null || game.projectedSpread === null) {
      return { away: 0, home: 0, toward: false };
    }
    
    if (game.openingSpread === game.closingSpread) {
      return { away: 0, home: 0, toward: false };
    }
    
    const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
    const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
    const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
    const movingToward = closeDiff < openDiff;
    
    if (game.closingSpread < game.openingSpread) {
      // Line moved toward home
      return { away: 0, home: lineMovement, toward: movingToward };
    } else {
      // Line moved toward away
      return { away: lineMovement, home: 0, toward: movingToward };
    }
  };

  // Filter and sort history games
  const filteredHistoryGames = useMemo(() => {
    let games = [...historyGames];
    
    // Helper to get Eastern date as YYYY-MM-DD string
    const getEasternDate = (dateStr: string): string => {
      return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    };
    
    // Date filters (convert to Eastern time to match game dates)
    if (historyStartDate) {
      games = games.filter(g => {
        const easternDate = getEasternDate(g.gameDate);
        return easternDate >= historyStartDate;
      });
    }
    if (historyEndDate) {
      games = games.filter(g => {
        const easternDate = getEasternDate(g.gameDate);
        return easternDate <= historyEndDate;
      });
    }
    
    // Difference filter
    if (historyDiffMin > 0) {
      games = games.filter(g => g.difference !== null && Math.abs(g.difference) >= historyDiffMin);
    }
    
    // Sort
    games.sort((a, b) => {
      let comparison = 0;
      
      switch (historySortField) {
        case 'date':
          comparison = new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime();
          break;
        case 'diff':
          const diffA = a.difference !== null ? Math.abs(a.difference) : -999;
          const diffB = b.difference !== null ? Math.abs(b.difference) : -999;
          comparison = diffA - diffB;
          break;
        case 'awayMovement':
          const awayA = getLineMovement(a);
          const awayB = getLineMovement(b);
          comparison = Math.abs(awayA.away) - Math.abs(awayB.away);
          if (comparison === 0 && awayA.toward !== awayB.toward) {
            comparison = awayA.toward ? 1 : -1;
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
        case 'vOpen':
          const vOpenA = (a.projectedSpread !== null && a.openingSpread !== null) ? Math.abs(a.projectedSpread - a.openingSpread) : -999;
          const vOpenB = (b.projectedSpread !== null && b.openingSpread !== null) ? Math.abs(b.projectedSpread - b.openingSpread) : -999;
          comparison = vOpenA - vOpenB;
          break;
      }
      
      return historySortDirection === 'asc' ? comparison : -comparison;
    });
    
    // Filter to value checkmark games only if toggle is on
    let result = games;
    if (showValueOnly) {
      result = result.filter(g => {
        if (g.projectedSpread === null || g.openingSpread === null || g.closingSpread === null) return false;
        const _openDiff = Math.abs(g.projectedSpread - g.openingSpread);
        
        // Signal #4: opener disagrees with projection by 5+
        if (_openDiff >= 5) return true;
        
        // Steam signal: opener agreed, line moved away, bet dog, 5+ spread only
        if (g.openingSpread === g.closingSpread) return false;
        const _closeDiff = Math.abs(g.projectedSpread - g.closingSpread);
        const _lineMovement = Math.abs(g.closingSpread - g.openingSpread);
        const valueFires = _closeDiff >= 1 && _closeDiff > _openDiff && _lineMovement >= 1;
        const openerAgreed = _openDiff <= 1.5;
        const absSpread = Math.abs(g.closingSpread);
        if (!valueFires || !openerAgreed || absSpread < 5) return false;
        if (g.closingSpread < g.openingSpread) {
          return g.closingSpread < 0;
        } else {
          return g.closingSpread > 0;
        }
      });
    }
    if (showVOpenOnly) {
      result = result.filter(g => g.projectedSpread !== null && g.openingSpread !== null && Math.abs(g.projectedSpread - g.openingSpread) >= 2);
    }
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      result = result.filter(g => g.homeTeam.toLowerCase().includes(q) || g.awayTeam.toLowerCase().includes(q));
    }
    
    return result;
  }, [historyGames, historyStartDate, historyEndDate, historyDiffMin, historySortField, historySortDirection, showValueOnly, showVOpenOnly, deferredSearch]);

  // Compute W-L record for games with value checkmarks in the filtered set
  const checkmarkRecord = useMemo(() => {
    let wins1 = 0, losses1 = 0;  // Signal 1: opener 5+ off projection (single ✓)
    let wins2 = 0, losses2 = 0;  // Steam signal 5-6.9 (✓✓)
    let wins3 = 0, losses3 = 0;  // Steam signal 7+ (✓✓✓)
    let pushes = 0;
    
    for (const game of filteredHistoryGames) {
      if (game.projectedSpread === null || game.openingSpread === null || game.closingSpread === null) continue;
      
      const actualMargin = (game.homeScore !== null && game.awayScore !== null)
        ? game.homeScore - game.awayScore : null;
      const spreadResult = (actualMargin !== null && game.closingSpread !== null)
        ? actualMargin + game.closingSpread : null;
      
      if (spreadResult === null) continue;
      
      const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
      
      // Signal #4: opener disagrees with projection by 5+ — bet our side
      if (openDiff >= 5) {
        // Our side: if proj < close, we favor home; if proj > close, we favor away
        let ourSideCovered = false;
        if (game.projectedSpread < game.closingSpread) {
          ourSideCovered = spreadResult > 0; // home covers
        } else if (game.projectedSpread > game.closingSpread) {
          ourSideCovered = spreadResult < 0; // away covers
        }
        if (spreadResult === 0) {
          pushes++;
        } else if (ourSideCovered) {
          wins1++;
        } else {
          losses1++;
        }
      }
      
      // Steam signal: opener agreed, line moved away, bet the dog (5+ only)
      if (game.openingSpread !== game.closingSpread) {
        const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
        const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
        const valueFires = closeDiff >= 1 && closeDiff > openDiff && lineMovement >= 1;
        const openerAgreed = openDiff <= 1.5;
        
        if (valueFires && openerAgreed) {
          const absSpread = Math.abs(game.closingSpread);
          if (absSpread >= 5) {
            let hasCheck = false;
            let dogCovered = false;
            
            if (game.closingSpread < game.openingSpread) {
              if (game.closingSpread < 0) {
                hasCheck = true;
                dogCovered = spreadResult < 0;
              }
            } else {
              if (game.closingSpread > 0) {
                hasCheck = true;
                dogCovered = spreadResult > 0;
              }
            }
            
            if (hasCheck) {
              if (spreadResult === 0) {
                pushes++;
              } else if (dogCovered) {
                if (absSpread >= 7) wins3++; else wins2++;
              } else {
                if (absSpread >= 7) losses3++; else losses2++;
              }
            }
          }
        }
      }
    }
    
    const wins = wins1 + wins2 + wins3;
    const losses = losses1 + losses2 + losses3;
    const total = wins + losses + pushes;
    return { wins, losses, pushes, total, wins1, losses1, wins2, losses2, wins3, losses3 };
  }, [filteredHistoryGames]);

  return (
    <>
      {/* Filters */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-900">Date Range:</span>
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
                className="px-2 py-1 text-xs text-gray-900 hover:text-gray-900"
              >
                Clear
              </button>
            )}
            <span className="text-gray-300 mx-2">|</span>
            <span className="text-sm text-gray-900">|Diff| ≥</span>
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
            <span className="text-xs text-gray-900 font-mono w-6">{historyDiffMinDisplay}</span>
            {historyDiffMinDisplay !== 0 && (
              <button
                onClick={() => { setHistoryDiffMinDisplay(0); setHistoryDiffMin(0); }}
                className="px-2 py-1 text-xs text-gray-900 hover:text-gray-900"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Search team..."
                className="w-36 sm:w-44 px-2 py-1 pl-7 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {teamSearch && (
                <button onClick={() => setTeamSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-600 text-sm font-bold">✓</span>
              <button
                onClick={() => setShowValueOnly(!showValueOnly)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showValueOnly ? 'bg-green-500' : 'bg-gray-300'}`}
                title="Show only games with value checkmarks"
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showValueOnly ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-blue-600 text-sm font-bold">▲</span>
              <span className="text-xs text-gray-600">v. Open</span>
              <button
                onClick={() => setShowVOpenOnly(!showVOpenOnly)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showVOpenOnly ? 'bg-blue-500' : 'bg-gray-300'}`}
                title="Show only games where |Proj - Open| ≥ 2"
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${showVOpenOnly ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            <button
              onClick={loadHistory}
              disabled={historyLoading}
              className="px-3 py-1 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
            >
              {historyLoading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading...
                </span>
              ) : 'Refresh'}
            </button>
            <button
              onClick={handleBackfill}
              disabled={backfillLoading || !historyStartDate}
              className="px-3 py-1 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Re-fetch closing lines for the selected start date"
            >
              {backfillLoading ? (
                <span className="flex items-center gap-1">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Backfilling...
                </span>
              ) : 'Backfill Closing'}
            </button>
            {backfillMessage && (
              <span className={`text-xs ${backfillMessage.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {backfillMessage}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-sm">
          <span className="text-gray-900">{filteredHistoryGames.length}/{historyGames.length}</span>
          {(checkmarkRecord.wins1 + checkmarkRecord.losses1) > 0 && (
            <span className="text-blue-700 font-semibold whitespace-nowrap cursor-help" title="Mismatch: Our projection is 5+ pts off the opener. Market has the game wrong — bet our side.">
              ✓ {checkmarkRecord.wins1}-{checkmarkRecord.losses1}
            </span>
          )}
          {(checkmarkRecord.wins2 + checkmarkRecord.losses2) > 0 && (
            <span className="text-green-800 font-semibold whitespace-nowrap cursor-help" title="Steam (5-6.9): Opener agreed with our projection, then the line steamed 1+ pts away. Bet the dog.">
              ✓✓ {checkmarkRecord.wins2}-{checkmarkRecord.losses2}
            </span>
          )}
          {(checkmarkRecord.wins3 + checkmarkRecord.losses3) > 0 && (
            <span className="text-green-900 font-semibold whitespace-nowrap cursor-help" title="Steam (7+): Opener agreed with our projection, then the line steamed 1+ pts away on a big spread. Bet the dog.">
              ✓✓✓ {checkmarkRecord.wins3}-{checkmarkRecord.losses3}
            </span>
          )}
        </div>
      </div>
      {/* Legend */}
      <div className="px-4 py-2 text-xs flex flex-wrap items-center gap-2 sm:gap-4 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-200 rounded"></div>
          <span className="text-gray-900">Toward projection</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-200 rounded"></div>
          <span className="text-gray-900">Against projection</span>
        </div>
        <span className="text-gray-400 ml-2">| Click column headers to sort</span>
      </div>
      
      {/* Content */}
      {historyLoading ? (
        <div className="p-8 text-center text-gray-900">
          <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading history...
        </div>
      ) : filteredHistoryGames.length === 0 ? (
        <div className="p-8 text-center text-gray-900">
          <div className="text-4xl mb-3">📊</div>
          <p>No historical games found.</p>
          <p className="text-sm mt-2">{historyGames.length > 0 ? 'Try adjusting the date filter.' : 'Sync games to build history.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-blue-900 sticky top-0 z-10">
              <tr>
                <th 
                  className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-white uppercase cursor-pointer hover:bg-blue-800"
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
                  className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-blue-800"
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
                <th className="px-1 py-3 text-center text-xs font-semibold text-white uppercase w-6 hidden sm:table-cell"></th>
                <th 
                  className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-blue-800"
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
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap">Proj</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase">Open</th>
                <th 
                  className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (historySortField === 'vOpen') {
                      setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setHistorySortField('vOpen');
                      setHistorySortDirection('desc');
                    }
                  }}
                >
                  v. Open {historySortField === 'vOpen' && (historySortDirection === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase">Close</th>
                <th 
                  className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (historySortField === 'diff') {
                      setHistorySortDirection(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setHistorySortField('diff');
                      setHistorySortDirection('asc');
                    }
                  }}
                >
                  v. Close {historySortField === 'diff' && (historySortDirection === 'desc' ? '↓' : '↑')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredHistoryGames.map((game, index) => {
                const gameDate = new Date(game.gameDate);
                const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
                
                // Calculate highlights
                let highlightAwayClass = '';
                let highlightHomeClass = '';
                let highlightProjClass = '';
                let awayValueTier = 0;  // 0=none, 2=✓✓ (5-6.9), 3=✓✓✓ (7+) — steam signal
                let homeValueTier = 0;
                let awayMismatchCheck = false;  // Signal #4: opener 5+ off projection
                let homeMismatchCheck = false;
                
                if (game.projectedSpread !== null && game.openingSpread !== null && game.closingSpread !== null) {
                  const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
                  const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
                  const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
                  const movingToward = closeDiff < openDiff;
                  const highlightClass = game.openingSpread !== game.closingSpread
                    ? (movingToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement))
                    : '';
                  
                  // Signal #4: opener disagrees with projection by 5+ — bet our side
                  if (openDiff >= 5) {
                    if (game.projectedSpread < game.closingSpread) {
                      homeMismatchCheck = true;  // we favor home
                    } else if (game.projectedSpread > game.closingSpread) {
                      awayMismatchCheck = true;  // we favor away
                    }
                  }
                  
                  // Steam signal: opener agreed, line moved away, bet the dog (5+ only)
                  if (game.openingSpread !== game.closingSpread) {
                    const valueFires = closeDiff >= 1 && closeDiff > openDiff && lineMovement >= 1;
                    const openerAgreed = openDiff <= 1.5;
                    const absSpread = Math.abs(game.closingSpread);
                    const tier = absSpread >= 7 ? 3 : absSpread >= 5 ? 2 : 0;  // no tier 1
                    
                    highlightProjClass = highlightClass;
                    if (game.closingSpread < game.openingSpread) {
                      highlightHomeClass = highlightClass;
                      if (valueFires && openerAgreed && game.closingSpread < 0 && tier >= 2) {
                        awayValueTier = tier;
                      }
                    } else {
                      highlightAwayClass = highlightClass;
                      if (valueFires && openerAgreed && game.closingSpread > 0 && tier >= 2) {
                        homeValueTier = tier;
                      }
                    }
                  }
                }
                
                const homeLogo = getTeamLogo(game.homeTeam);
                const awayLogo = getTeamLogo(game.awayTeam);
                
                // Determine if each team covered the closing spread
                const actualMargin = (game.homeScore !== null && game.awayScore !== null)
                  ? game.homeScore - game.awayScore : null;
                const spreadResult = (actualMargin !== null && game.closingSpread !== null)
                  ? actualMargin + game.closingSpread : null;
                const homeCovered = spreadResult !== null && spreadResult > 0;
                const awayCovered = spreadResult !== null && spreadResult < 0;
                
                return (
                  <tr key={`history-${index}`} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{dateStr}</td>
                    <td className={`px-1 sm:px-4 py-1 ${highlightAwayClass} relative`}>
                      <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                        <TeamLogo teamName={game.awayTeam} logoUrl={awayLogo} size="sm" />
                        <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.awayTeam}</span>
                        {awayValueTier > 0 && (
                          <span className={`absolute -bottom-1 -right-1 text-green-600 text-xs font-bold ${awayCovered ? 'border border-green-600 rounded-full px-0.5 flex items-center justify-center bg-white' : ''}`} title={`Steam signal: opener agreed, line moved away — bet dog${awayValueTier >= 3 ? ' (7+)' : ' (5+)'}${awayCovered ? ' ✓covered' : ''}`}>{'✓'.repeat(awayValueTier)}</span>
                        )}
                        {awayMismatchCheck && !awayValueTier && (
                          <span className={`absolute -bottom-1 -right-1 text-blue-600 text-xs font-bold ${awayCovered ? 'border border-blue-600 rounded-full px-0.5 flex items-center justify-center bg-white' : ''}`} title={`Mismatch signal: projection 5+ off opener — bet our side${awayCovered ? ' ✓covered' : ''}`}>✓</span>
                        )}
                      </div>
                      {game.awayScore !== null && (
                        <span className={`absolute bottom-0.5 right-1 text-[10px] font-mono ${game.homeScore !== null && game.awayScore > game.homeScore ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                          {game.awayScore}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-3 text-center text-gray-400 hidden sm:table-cell">@</td>
                    <td className={`px-1 sm:px-4 py-1 ${highlightHomeClass} relative`}>
                      <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                        <TeamLogo teamName={game.homeTeam} logoUrl={homeLogo} size="sm" />
                        <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.homeTeam}</span>
                        {homeValueTier > 0 && (
                          <span className={`absolute -bottom-1 -right-1 text-green-600 text-xs font-bold ${homeCovered ? 'border border-green-600 rounded-full px-0.5 flex items-center justify-center bg-white' : ''}`} title={`Steam signal: opener agreed, line moved away — bet dog${homeValueTier >= 3 ? ' (7+)' : ' (5+)'}${homeCovered ? ' ✓covered' : ''}`}>{'✓'.repeat(homeValueTier)}</span>
                        )}
                        {homeMismatchCheck && !homeValueTier && (
                          <span className={`absolute -bottom-1 -right-1 text-blue-600 text-xs font-bold ${homeCovered ? 'border border-blue-600 rounded-full px-0.5 flex items-center justify-center bg-white' : ''}`} title={`Mismatch signal: projection 5+ off opener — bet our side${homeCovered ? ' ✓covered' : ''}`}>✓</span>
                        )}
                      </div>
                      {game.homeScore !== null && (
                        <span className={`absolute bottom-0.5 right-1 text-[10px] font-mono ${game.awayScore !== null && game.homeScore > game.awayScore ? 'font-bold text-green-700' : 'text-gray-600'}`}>
                          {game.homeScore}
                        </span>
                      )}
                    </td>
                    <td className={`px-2 sm:px-4 py-3 text-center ${highlightProjClass}`}>
                        {game.projectedSpread !== null ? (
                          <span className="font-mono text-xs sm:text-sm font-semibold text-gray-900">
                            {game.projectedSpread > 0 ? '+' : ''}{game.projectedSpread.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-center">
                      {game.openingSpread !== null ? (
                        <div className="relative inline-flex items-center justify-center">
                          {game.openingSpread !== 0 && homeLogo && (
                            <img src={homeLogo} alt="" className="absolute -bottom-2 -right-3 w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          )}
                          <span className="font-mono text-xs sm:text-sm">
                            {game.openingSpread > 0 ? '+' : ''}{game.openingSpread.toFixed(1)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-center">
                      {game.projectedSpread !== null && game.openingSpread !== null ? (
                        <span className={`font-mono text-xs sm:text-sm font-semibold px-1 sm:px-2 py-1 rounded ${Math.abs(game.projectedSpread - game.openingSpread) >= 3 ? 'bg-green-100' : 'bg-gray-100'}`}>
                          {Math.abs(game.projectedSpread - game.openingSpread).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-center font-mono font-semibold">
                      {game.closingSpread !== null ? (game.closingSpread > 0 ? '+' : '') + game.closingSpread.toFixed(1) : '—'}
                    </td>
                    <td className={`px-2 sm:px-4 py-3 text-sm text-center font-mono font-semibold ${
                      game.difference !== null 
                        ? game.difference > 0 ? 'text-red-600' : game.difference < 0 ? 'text-green-600' : 'text-gray-400'
                        : 'text-gray-400'
                    }`}>
                      {game.difference !== null ? (game.difference > 0 ? '+' : '') + game.difference.toFixed(1) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 text-xs text-gray-900 border-t border-gray-100 bg-gray-50">
            v. Close = |Close − Proj| (negative = market moved toward our projection)
          </div>
        </div>
      )}
    </>
  );
}
