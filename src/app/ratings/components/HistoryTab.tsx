// src/app/ratings/components/HistoryTab.tsx
'use client';

import React, { useMemo, useState } from 'react';
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
    
    // Date filters
    if (historyStartDate) {
      games = games.filter(g => g.gameDate >= historyStartDate);
    }
    if (historyEndDate) {
      games = games.filter(g => g.gameDate <= historyEndDate + 'T23:59:59');
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
      }
      
      return historySortDirection === 'asc' ? comparison : -comparison;
    });
    
    return games;
  }, [historyGames, historyStartDate, historyEndDate, historyDiffMin, historySortField, historySortDirection]);

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
            <span className="text-sm text-gray-900">
              Showing {filteredHistoryGames.length} of {historyGames.length} games
            </span>
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
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 text-xs flex flex-wrap items-center gap-2 sm:gap-4 bg-gray-50 border-b border-gray-100">
        <span className="text-gray-900">Line Movement:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-200 rounded"></div>
          <span className="text-gray-900">Toward projection</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-200 rounded"></div>
          <span className="text-gray-900">Against projection</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-green-600 text-sm">✓</span>
          <span className="text-gray-900">Value (1+ pt away)</span>
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
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap" title="BT (upper-left) / Our Proj (lower-right)">BT/Proj</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap" title="Weighted blend">Blend</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase">Open</th>
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
                  Diff {historySortField === 'diff' && (historySortDirection === 'desc' ? '↓' : '↑')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredHistoryGames.map((game, index) => {
                const gameDate = new Date(game.gameDate);
                const dateStr = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                // Calculate highlights
                let highlightAwayClass = '';
                let highlightHomeClass = '';
                let highlightProjClass = '';
                let highlightBtClass = '';
                let highlightBlendClass = '';
                let showAwayValueCheck = false;
                let showHomeValueCheck = false;
                
                const blendSpread = (game.btSpread !== null && game.projectedSpread !== null)
                  ? 0.38022 + (game.btSpread * 0.355163) + (game.projectedSpread * 0.620901)
                  : (game.projectedSpread !== null ? game.projectedSpread : null);
                
                if (game.projectedSpread !== null && game.openingSpread !== null && game.closingSpread !== null && game.openingSpread !== game.closingSpread) {
                  const openDiff = Math.abs(game.projectedSpread - game.openingSpread);
                  const closeDiff = Math.abs(game.projectedSpread - game.closingSpread);
                  const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
                  const movingToward = closeDiff < openDiff;
                  const highlightClass = movingToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                  
                  // Value check: closing line is 1+ points away from projection AND moved away AND moved 1+ point from open
                  const showValueCheck = closeDiff >= 1 && closeDiff > openDiff && lineMovement >= 1;
                  
                  highlightProjClass = highlightClass;
                  if (game.closingSpread < game.openingSpread) {
                    highlightHomeClass = highlightClass;
                    if (showValueCheck) {
                      showHomeValueCheck = true;
                    }
                  } else {
                    highlightAwayClass = highlightClass;
                    if (showValueCheck) {
                      showAwayValueCheck = true;
                    }
                  }
                }
                
                if (game.btSpread !== null && game.openingSpread !== null && game.closingSpread !== null && game.openingSpread !== game.closingSpread) {
                  const openDiffBt = Math.abs(game.btSpread - game.openingSpread);
                  const closeDiffBt = Math.abs(game.btSpread - game.closingSpread);
                  const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
                  const movingTowardBt = closeDiffBt < openDiffBt;
                  highlightBtClass = movingTowardBt ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                }
                
                if (blendSpread !== null && game.openingSpread !== null && game.closingSpread !== null && game.openingSpread !== game.closingSpread) {
                  const openDiffBlend = Math.abs(blendSpread - game.openingSpread);
                  const closeDiffBlend = Math.abs(blendSpread - game.closingSpread);
                  const lineMovement = Math.abs(game.closingSpread - game.openingSpread);
                  const movingTowardBlend = closeDiffBlend < openDiffBlend;
                  highlightBlendClass = movingTowardBlend ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                }
                
                const homeLogo = getTeamLogo(game.homeTeam);
                const awayLogo = getTeamLogo(game.awayTeam);
                
                return (
                  <tr key={`history-${index}`} className="hover:bg-gray-50">
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{dateStr}</td>
                    <td className={`px-1 sm:px-4 py-3 ${highlightAwayClass}`}>
                      <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                        <TeamLogo teamName={game.awayTeam} logoUrl={awayLogo} size="sm" />
                        <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.awayTeam}</span>
                        {showAwayValueCheck && (
                          <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title="Value: line moved 1+ pt away from projection">✓</span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-3 text-center text-gray-400 hidden sm:table-cell">@</td>
                    <td className={`px-1 sm:px-4 py-3 ${highlightHomeClass}`}>
                      <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                        <TeamLogo teamName={game.homeTeam} logoUrl={homeLogo} size="sm" />
                        <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.homeTeam}</span>
                        {showHomeValueCheck && (
                          <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title="Value: line moved 1+ pt away from projection">✓</span>
                        )}
                      </div>
                    </td>
                    <td className="px-1 sm:px-2 py-1 text-center">
                      <div className="relative w-16 h-10 mx-auto overflow-hidden rounded">
                        <div className={`absolute inset-0 ${highlightBtClass}`} style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                        <div className={`absolute inset-0 ${highlightProjClass}`} style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
                        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                          <line x1="0" y1="100%" x2="100%" y2="0" stroke="#9ca3af" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        </svg>
                        <span className="absolute top-0 left-0.5 font-mono text-xs font-semibold text-purple-600">
                          {game.btSpread !== null ? (game.btSpread > 0 ? '+' : '') + game.btSpread.toFixed(1) : '—'}
                        </span>
                        <span className="absolute bottom-0 right-0.5 font-mono text-xs font-semibold text-gray-900">
                          {game.projectedSpread !== null ? (game.projectedSpread > 0 ? '+' : '') + game.projectedSpread.toFixed(1) : '—'}
                        </span>
                      </div>
                    </td>
                    <td className={`px-2 sm:px-4 py-3 text-center ${highlightBlendClass}`}>
                      {blendSpread !== null ? (
                        <span className="font-mono text-xs sm:text-sm font-semibold text-gray-900">
                          {blendSpread > 0 ? '+' : ''}{blendSpread.toFixed(1)}
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
            Diff = Close − Proj (negative = market moved toward our projection)
          </div>
        </div>
      )}
    </>
  );
}
