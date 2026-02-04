// src/app/ratings/components/ScheduleTab.tsx
'use client';

import React, { useMemo } from 'react';
import { TeamLogo } from './TeamLogo';
import type { 
  CombinedScheduleGame, 
  HistoryGame, 
  TeamOverride, 
  RatingsSnapshot,
  ScheduleFilter,
  ScheduleSortField,
  SortDirection,
} from '../types';
import { parseTimeToMinutes } from '../utils/teamMatching';

interface ScheduleTabProps {
  combinedScheduleGames: CombinedScheduleGame[];
  historyGames: HistoryGame[];
  snapshot: RatingsSnapshot | null;
  overrides: TeamOverride[];
  hca: number;
  scheduleFilter: ScheduleFilter;
  setScheduleFilter: (filter: ScheduleFilter) => void;
  scheduleSortBy: ScheduleSortField;
  setScheduleSortBy: (sort: ScheduleSortField) => void;
  scheduleSortDir: SortDirection;
  setScheduleSortDir: (dir: SortDirection) => void;
  scheduleLoading: boolean;
  oddsLoading: boolean;
  oddsError: string | null;
  loadSchedule: () => void;
  getTeamLogo: (teamName: string) => string | null;
}

export function ScheduleTab({
  combinedScheduleGames,
  historyGames,
  snapshot,
  overrides,
  hca,
  scheduleFilter,
  setScheduleFilter,
  scheduleSortBy,
  setScheduleSortBy,
  scheduleSortDir,
  setScheduleSortDir,
  scheduleLoading,
  oddsLoading,
  oddsError,
  loadSchedule,
  getTeamLogo,
}: ScheduleTabProps) {
  
  // Find team rating using BT team names
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

  // Filter and sort games
  const filteredScheduleGames = useMemo(() => {
    let games = [...combinedScheduleGames];
    
    // Apply filter
    if (scheduleFilter === 'today') {
      games = games.filter(g => g.isToday);
    } else if (scheduleFilter === 'tomorrow') {
      games = games.filter(g => g.isTomorrow);
    } else if (scheduleFilter === 'day2') {
      games = games.filter(g => g.isDay2);
    } else if (scheduleFilter === 'day3') {
      games = games.filter(g => g.isDay3);
    }
    
    // Calculate projections and deltas for sorting
    const gamesWithCalcs = games.map(game => {
      const homeRating = findTeamRating(game.homeTeam);
      const awayRating = findTeamRating(game.awayTeam);
      
      // Look up stored projection from history
      const historyMatch = historyGames.find(h => 
        h.homeTeam.toLowerCase() === game.homeTeam.toLowerCase() && 
        h.awayTeam.toLowerCase() === game.awayTeam.toLowerCase()
      );
      
      let projectedSpread: number | null = null;
      if (historyMatch?.projectedSpread !== null && historyMatch?.projectedSpread !== undefined) {
        projectedSpread = historyMatch.projectedSpread;
      } else if (homeRating && awayRating) {
        projectedSpread = -((homeRating.rating - awayRating.rating) + hca);
        projectedSpread = Math.round(projectedSpread * 100) / 100;
      }
      
      const delta = projectedSpread !== null && game.spread !== null
        ? Math.abs(projectedSpread - game.spread)
        : null;
      
      // Line movement calculations
      let awayMovement = 0;
      let homeMovement = 0;
      if (game.openingSpread !== null && game.spread !== null && projectedSpread !== null) {
        const lineMove = game.spread - game.openingSpread;
        const openDiff = Math.abs(projectedSpread - game.openingSpread);
        const currentDiff = Math.abs(projectedSpread - game.spread);
        const movingToward = currentDiff < openDiff;
        const magnitude = Math.abs(lineMove);
        
        if (lineMove < 0) {
          // Line moved toward home (home getting more points)
          homeMovement = movingToward ? magnitude : -magnitude;
          awayMovement = movingToward ? -magnitude : magnitude;
        } else {
          // Line moved toward away
          awayMovement = movingToward ? magnitude : -magnitude;
          homeMovement = movingToward ? -magnitude : magnitude;
        }
      }
      
      return { ...game, projectedSpread, delta, awayMovement, homeMovement };
    });
    
    // Sort
    if (scheduleSortBy === 'time') {
      gamesWithCalcs.sort((a, b) => {
        const dateCompare = a.gameDate.localeCompare(b.gameDate);
        if (dateCompare !== 0) return dateCompare;
        return parseTimeToMinutes(a.gameTime) - parseTimeToMinutes(b.gameTime);
      });
    } else if (scheduleSortBy === 'delta') {
      gamesWithCalcs.sort((a, b) => {
        const aVal = a.delta ?? -999;
        const bVal = b.delta ?? -999;
        return scheduleSortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    } else if (scheduleSortBy === 'awayMovement') {
      gamesWithCalcs.sort((a, b) => {
        return scheduleSortDir === 'desc' ? b.awayMovement - a.awayMovement : a.awayMovement - b.awayMovement;
      });
    } else if (scheduleSortBy === 'homeMovement') {
      gamesWithCalcs.sort((a, b) => {
        return scheduleSortDir === 'desc' ? b.homeMovement - a.homeMovement : a.homeMovement - b.homeMovement;
      });
    }
    
    return gamesWithCalcs;
  }, [combinedScheduleGames, scheduleFilter, scheduleSortBy, scheduleSortDir, historyGames, snapshot, overrides, hca]);

  // Line movement highlighting helpers
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

  return (
    <>
      {/* Filter bar */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900">Filter:</span>
          <div className="flex rounded-lg overflow-hidden border border-gray-300">
            {([
              { key: 'all' as const, label: 'All' },
              { key: 'today' as const, label: 'Today' },
              { key: 'tomorrow' as const, label: 'Tomorrow' },
              { key: 'day2' as const, label: '+2' },
              { key: 'day3' as const, label: '+3' },
            ]).map(({ key, label }) => {
              const count = key === 'today' ? combinedScheduleGames.filter(g => g.isToday).length
                : key === 'tomorrow' ? combinedScheduleGames.filter(g => g.isTomorrow).length
                : key === 'day2' ? combinedScheduleGames.filter(g => g.isDay2).length
                : key === 'day3' ? combinedScheduleGames.filter(g => g.isDay3).length
                : 0;
              return (
                <button
                  key={key}
                  onClick={() => setScheduleFilter(key)}
                  className={`px-3 py-1 text-sm font-medium ${scheduleFilter === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}`}
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

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs">
        <span className="text-gray-900 font-medium">Line Movement:</span>
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
        <span className="text-gray-400 hidden sm:inline">| Intensity = magnitude of move</span>
      </div>

      {/* Odds loading status */}
      {oddsLoading ? (
        <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-sm text-blue-600">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading odds...
        </div>
      ) : oddsError ? (
        <div className="px-4 py-2 bg-red-50 border-b border-red-100 flex items-center gap-2 text-sm">
          <span className="text-red-600">⚠️ {oddsError}</span>
          <button onClick={loadSchedule} className="text-blue-600 hover:text-blue-800 underline">
            Retry
          </button>
        </div>
      ) : null}

      {/* Table */}
      {scheduleLoading ? (
        <div className="p-8 text-center text-gray-900">Loading schedule...</div>
      ) : filteredScheduleGames.length === 0 ? (
        <div className="p-8 text-center text-gray-900">
          <div className="text-4xl mb-3">📅</div>
          <p>No games found for {scheduleFilter === 'all' ? 'the next 4 days' : scheduleFilter}.</p>
          <p className="text-sm mt-2">Try refreshing BT data locally.</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-blue-900 sticky top-0 z-10">
              <tr>
                <th 
                  className="px-1 sm:px-4 py-3 text-left text-xs font-semibold text-white uppercase whitespace-nowrap w-10 sm:w-auto cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    setScheduleSortBy('time');
                    setScheduleSortDir('asc');
                  }}
                >
                  Time {scheduleSortBy === 'time' && '↓'}
                </th>
                <th 
                  className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (scheduleSortBy === 'awayMovement') {
                      setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                    } else {
                      setScheduleSortBy('awayMovement');
                      setScheduleSortDir('desc');
                    }
                  }}
                >
                  Away {scheduleSortBy === 'awayMovement' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-1 py-3 text-center text-xs font-semibold text-white uppercase w-6 hidden sm:table-cell"></th>
                <th 
                  className="px-1 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase min-w-[60px] sm:min-w-[120px] cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (scheduleSortBy === 'homeMovement') {
                      setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                    } else {
                      setScheduleSortBy('homeMovement');
                      setScheduleSortDir('desc');
                    }
                  }}
                >
                  Home {scheduleSortBy === 'homeMovement' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap" title="BT (upper-left) / Our Proj (lower-right)">BT/Proj</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap" title="Weighted blend of BT and our projection">Blend</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap">Open</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap">Curr</th>
                <th 
                  className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (scheduleSortBy === 'delta') {
                      setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                    } else {
                      setScheduleSortBy('delta');
                      setScheduleSortDir('desc');
                    }
                  }}
                >
                  Delta {scheduleSortBy === 'delta' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                </th>
                <th className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-white uppercase whitespace-nowrap hidden sm:table-cell">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredScheduleGames.map((game, index) => {
                const prevGame = index > 0 ? filteredScheduleGames[index - 1] : null;
                const showDateHeader = !prevGame || prevGame.gameDate !== game.gameDate;
                
                const timeStr = game.gameTime || '—';
                const timeStrMobile = timeStr.replace(/ ?[AP]M$/i, '');
                const dayStr = game.dateLabel;
                
                const homeRating = findTeamRating(game.homeTeam);
                const awayRating = findTeamRating(game.awayTeam);
                const btSpread = game.btSpread;
                const projectedSpread = game.projectedSpread;
                const delta = game.delta;
                
                // Calculate blend
                const blendSpread = (btSpread !== null && projectedSpread !== null)
                  ? 0.38022 + (btSpread * 0.355163) + (projectedSpread * 0.620901)
                  : (projectedSpread !== null ? projectedSpread : null);
                
                // Highlighting logic
                let highlightAwayClass = '';
                let highlightHomeClass = '';
                let highlightProjClass = '';
                let highlightBtClass = '';
                let highlightBlendClass = '';
                let showAwayValueCheck = false;
                let showHomeValueCheck = false;
                
                if (projectedSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
                  const openDiff = Math.abs(projectedSpread - game.openingSpread);
                  const currentDiff = Math.abs(projectedSpread - game.spread);
                  const lineMovement = Math.abs(game.spread - game.openingSpread);
                  const movingToward = currentDiff < openDiff;
                  const highlightClass = movingToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                  
                  // Value check: current line is 1+ points away from projection AND moved away (not toward)
                  const showValueCheck = currentDiff >= 1 && currentDiff > openDiff;
                  
                  highlightProjClass = highlightClass;
                  if (game.spread < game.openingSpread) {
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
                
                if (btSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
                  const openDiffBt = Math.abs(btSpread - game.openingSpread);
                  const currentDiffBt = Math.abs(btSpread - game.spread);
                  const lineMovement = Math.abs(game.spread - game.openingSpread);
                  const movingTowardBt = currentDiffBt < openDiffBt;
                  highlightBtClass = movingTowardBt ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                }
                
                if (blendSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
                  const openDiffBlend = Math.abs(blendSpread - game.openingSpread);
                  const currentDiffBlend = Math.abs(blendSpread - game.spread);
                  const lineMovement = Math.abs(game.spread - game.openingSpread);
                  const movingTowardBlend = currentDiffBlend < openDiffBlend;
                  highlightBlendClass = movingTowardBlend ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                }
                
                return (
                  <React.Fragment key={game.id}>
                    {showDateHeader && (
                      <tr className="bg-blue-100">
                        <td colSpan={10} className="px-4 py-2">
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
                        <div className="text-xs text-gray-900">{dayStr}</div>
                      </td>
                      <td className={`px-1 sm:px-4 py-3 ${highlightAwayClass}`}>
                        <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                          <TeamLogo teamName={game.awayTeam} logoUrl={getTeamLogo(game.awayTeam)} />
                          <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.awayTeam}</span>
                          {!awayRating && <span className="text-xs text-red-400 hidden sm:inline" title="Team not found in ratings">?</span>}
                          {showAwayValueCheck && (
                            <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title="Value: line moved 1+ pt away from projection">✓</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 py-3 text-center hidden sm:table-cell">
                        <span className="text-gray-400 text-xs">@</span>
                      </td>
                      <td className={`px-1 sm:px-4 py-3 ${highlightHomeClass}`}>
                        <div className="flex items-center justify-center sm:justify-start gap-1 sm:gap-2 relative">
                          <TeamLogo teamName={game.homeTeam} logoUrl={getTeamLogo(game.homeTeam)} />
                          <span className="text-sm font-medium text-gray-900 hidden sm:inline">{game.homeTeam}</span>
                          {!homeRating && <span className="text-xs text-red-400 hidden sm:inline" title="Team not found in ratings">?</span>}
                          {showHomeValueCheck && (
                            <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title="Value: line moved 1+ pt away from projection">✓</span>
                          )}
                        </div>
                      </td>
                      <td className="px-1 sm:px-2 py-1 text-center">
                        {/* Combined BT/Proj cell with diagonal split */}
                        <div className="relative w-16 h-10 mx-auto overflow-hidden rounded">
                          <div className={`absolute inset-0 ${highlightBtClass}`} style={{ clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} />
                          <div className={`absolute inset-0 ${highlightProjClass}`} style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }} />
                          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
                            <line x1="0" y1="100%" x2="100%" y2="0" stroke="#9ca3af" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                          </svg>
                          <span className="absolute top-0 left-0.5 font-mono text-xs font-semibold text-purple-600">
                            {btSpread !== null ? (btSpread > 0 ? '+' : '') + btSpread.toFixed(1) : '—'}
                          </span>
                          <span className="absolute bottom-0 right-0.5 font-mono text-xs font-semibold text-gray-900">
                            {projectedSpread !== null ? (projectedSpread > 0 ? '+' : '') + projectedSpread.toFixed(1) : '—'}
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
                            {game.openingSpread !== 0 && getTeamLogo(game.homeTeam) && (
                              <img 
                                src={getTeamLogo(game.homeTeam)!}
                                alt=""
                                className="absolute -bottom-2 -right-3 w-4 h-4 object-contain"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <span className={`font-mono text-xs sm:text-sm font-semibold ${game.openingSpread < 0 ? 'text-green-600' : game.openingSpread > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {game.openingSpread > 0 ? '+' : ''}{game.openingSpread}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center">
                        {game.spread !== null ? (
                          <span className={`font-mono text-xs sm:text-sm font-semibold ${game.spread < 0 ? 'text-green-600' : game.spread > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                            {game.spread > 0 ? '+' : ''}{game.spread}
                            {game.isFrozen && <span className="ml-1 text-gray-400" title="Closing line (game started)">🔒</span>}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs" title="No odds available yet">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-4 py-3 text-center">
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
                          <span className="font-mono text-xs sm:text-sm text-gray-900">{game.total}</span>
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
          <div className="px-4 py-2 text-xs text-gray-900 border-t border-gray-100 bg-blue-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <span>
              Open & Current spreads sourced from Pinnacle, with DraftKings/FanDuel/BetMGM/BetRivers average as fallback.
              <span className="ml-2 text-gray-500">
                ({combinedScheduleGames.filter(g => g.spread !== null).length}/{combinedScheduleGames.length} with odds)
              </span>
            </span>
            {combinedScheduleGames.some(g => g.spread === null && !g.hasStarted) && !oddsLoading ? (
              <button onClick={loadSchedule} className="text-blue-600 hover:text-blue-800 underline">
                Refresh odds
              </button>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
