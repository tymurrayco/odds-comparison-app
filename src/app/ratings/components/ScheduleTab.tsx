// src/app/ratings/components/ScheduleTab.tsx
'use client';

import React, { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [showValueOnly, setShowValueOnly] = useState(false);
  const [showVOpenOnly, setShowVOpenOnly] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const deferredSearch = useDeferredValue(teamSearch);
  
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
      
      // Compute whether this game qualifies for the new value checkmark
      // Signal: opener agreed (within 1.5), line moved away from projection, and the "away from" side is the underdog
      let hasValueCheck = false;
      if (projectedSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
        const _openDiff = Math.abs(projectedSpread - game.openingSpread);
        const _currentDiff = Math.abs(projectedSpread - game.spread);
        const _lineMovement = Math.abs(game.spread - game.openingSpread);
        
        const valueFires = _currentDiff >= 1 && _currentDiff > _openDiff && _lineMovement >= 1;
        const openerAgreed = _openDiff <= 1.5;
        if (valueFires && openerAgreed) {
          if (game.spread < game.openingSpread) {
            // Line moved toward home → away is "away from" side → dog only if spread < 0
            hasValueCheck = game.spread < 0;
          } else {
            // Line moved toward away → home is "away from" side → dog only if spread > 0
            hasValueCheck = game.spread > 0;
          }
        }
      }
      
      return { ...game, projectedSpread, delta, awayMovement, homeMovement, hasValueCheck };
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
    } else if (scheduleSortBy === 'vOpen') {
      gamesWithCalcs.sort((a, b) => {
        const aVal = (a.projectedSpread !== null && a.openingSpread !== null) ? Math.abs(a.projectedSpread - a.openingSpread) : -999;
        const bVal = (b.projectedSpread !== null && b.openingSpread !== null) ? Math.abs(b.projectedSpread - b.openingSpread) : -999;
        return scheduleSortDir === 'desc' ? bVal - aVal : aVal - bVal;
      });
    }
    
    // Filter to value checkmark games only if toggle is on
    let result = gamesWithCalcs;
    if (showValueOnly) {
      result = result.filter(g => g.hasValueCheck);
    }
    if (showVOpenOnly) {
      result = result.filter(g => g.projectedSpread !== null && g.openingSpread !== null && Math.abs(g.projectedSpread - g.openingSpread) >= 2);
    }
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      result = result.filter(g => g.homeTeam.toLowerCase().includes(q) || g.awayTeam.toLowerCase().includes(q));
    }
    
    return result;
  }, [combinedScheduleGames, scheduleFilter, scheduleSortBy, scheduleSortDir, historyGames, snapshot, overrides, hca, showValueOnly, showVOpenOnly, deferredSearch]);

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
        <div className="flex items-center gap-4">
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
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-200 rounded"></div>
          <span className="text-gray-900">Toward projection</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-200 rounded"></div>
          <span className="text-gray-900">Against projection</span>
        </div>
        <span className="text-gray-400 hidden sm:inline">| Intensity = magnitude of move</span>
        <button
          onClick={loadSchedule}
          disabled={scheduleLoading}
          className="text-blue-600 hover:text-blue-700 text-xs font-medium ml-auto"
        >
          {scheduleLoading ? 'Loading...' : 'Refresh'}
        </button>
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
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap">Proj</th>
                <th className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap">Open</th>
                <th 
                  className="px-2 sm:px-4 py-3 text-center text-xs font-semibold text-white uppercase whitespace-nowrap cursor-pointer hover:bg-blue-800"
                  onClick={() => {
                    if (scheduleSortBy === 'vOpen') {
                      setScheduleSortDir(scheduleSortDir === 'desc' ? 'asc' : 'desc');
                    } else {
                      setScheduleSortBy('vOpen');
                      setScheduleSortDir('desc');
                    }
                  }}
                >
                  v. Open {scheduleSortBy === 'vOpen' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
                </th>
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
                  v. Current {scheduleSortBy === 'delta' && (scheduleSortDir === 'desc' ? '↓' : '↑')}
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
                const projectedSpread = game.projectedSpread;
                const delta = game.delta;
                
                // Highlighting logic
                let highlightAwayClass = '';
                let highlightHomeClass = '';
                let highlightProjClass = '';
                let awayValueTier = 0;  // 0=none, 1=✓, 2=✓✓ (5+), 3=✓✓✓ (7+)
                let homeValueTier = 0;
                
                if (projectedSpread !== null && game.openingSpread !== null && game.spread !== null && game.openingSpread !== game.spread) {
                  const openDiff = Math.abs(projectedSpread - game.openingSpread);
                  const currentDiff = Math.abs(projectedSpread - game.spread);
                  const lineMovement = Math.abs(game.spread - game.openingSpread);
                  const movingToward = currentDiff < openDiff;
                  const highlightClass = movingToward ? getGreenHighlightClass(lineMovement) : getRedHighlightClass(lineMovement);
                  
                  // New value signal: line moved away + opener agreed + underdog
                  const valueFires = currentDiff >= 1 && currentDiff > openDiff && lineMovement >= 1;
                  const openerAgreed = openDiff <= 1.5;
                  const absSpread = Math.abs(game.spread);
                  const tier = absSpread >= 7 ? 3 : absSpread >= 5 ? 2 : 1;
                  
                  highlightProjClass = highlightClass;
                  if (game.spread < game.openingSpread) {
                    // Line moved toward home
                    highlightHomeClass = highlightClass;
                    if (valueFires && openerAgreed && game.spread < 0) {
                      awayValueTier = tier;
                    }
                  } else {
                    // Line moved toward away
                    highlightAwayClass = highlightClass;
                    if (valueFires && openerAgreed && game.spread > 0) {
                      homeValueTier = tier;
                    }
                  }
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
                    <tr 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        sessionStorage.setItem('ratingsNav', JSON.stringify({ league: 'basketball_ncaab', search: game.awayTeam }));
                        router.push('/');
                      }}
                      title={`View odds for ${game.awayTeam} @ ${game.homeTeam}`}
                    >
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
                          {awayValueTier > 0 && (
                            <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title={`Opener agreed, line moved away — bet this dog${awayValueTier >= 3 ? ' (7+)' : awayValueTier >= 2 ? ' (5+)' : ''}`}>{'✓'.repeat(awayValueTier)}</span>
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
                          {homeValueTier > 0 && (
                            <span className="absolute -bottom-1 -right-1 text-green-600 text-xs font-bold" title={`Opener agreed, line moved away — bet this dog${homeValueTier >= 3 ? ' (7+)' : homeValueTier >= 2 ? ' (5+)' : ''}`}>{'✓'.repeat(homeValueTier)}</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-2 sm:px-4 py-3 text-center ${highlightProjClass}`}>
                        {projectedSpread !== null ? (
                          <span className="font-mono text-xs sm:text-sm font-semibold text-gray-900">
                            {projectedSpread > 0 ? '+' : ''}{projectedSpread.toFixed(1)}
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
                        {projectedSpread !== null && game.openingSpread !== null ? (
                          <span className={`font-mono text-xs sm:text-sm font-semibold px-1 sm:px-2 py-1 rounded ${Math.abs(projectedSpread - game.openingSpread) >= 3 ? 'bg-green-100' : 'bg-gray-100'}`}>
                            {Math.abs(projectedSpread - game.openingSpread).toFixed(1)}
                          </span>
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
