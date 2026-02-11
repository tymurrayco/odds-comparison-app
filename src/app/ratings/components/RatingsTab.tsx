// src/app/ratings/components/RatingsTab.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { TeamLogo } from './TeamLogo';
import { formatSpread, formatRating } from '@/lib/ratings/engine';
import type { 
  RatingsSnapshot, 
  GameAdjustment,
  RatingsSortField,
  SortDirection,
} from '../types';

interface RatingsTabProps {
  snapshot: RatingsSnapshot;
  hca: number;
  getTeamLogo: (teamName: string) => string | null;
}

export function RatingsTab({ snapshot, hca, getTeamLogo }: RatingsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<RatingsSortField>('rating');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Build map of team name -> adjustments
  const teamAdjustmentsMap = useMemo(() => {
    const map = new Map<string, GameAdjustment[]>();
    if (!snapshot?.adjustments) return map;
    
    for (const adj of snapshot.adjustments) {
      // Add to home team
      if (!map.has(adj.homeTeam)) map.set(adj.homeTeam, []);
      map.get(adj.homeTeam)!.push(adj);
      
      // Add to away team
      if (!map.has(adj.awayTeam)) map.set(adj.awayTeam, []);
      map.get(adj.awayTeam)!.push(adj);
    }
    
    // Sort each team's games by date
    for (const games of map.values()) {
      games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    
    return map;
  }, [snapshot?.adjustments]);

  // Build initial rank map
  const initialRankMap = useMemo(() => {
    if (!snapshot?.ratings) return new Map<string, number>();
    const sortedByInitial = [...snapshot.ratings].sort((a, b) => b.initialRating - a.initialRating);
    const map = new Map<string, number>();
    sortedByInitial.forEach((team, index) => {
      map.set(team.teamName, index + 1);
    });
    return map;
  }, [snapshot?.ratings]);

  // Filter and sort ratings
  const filteredRatings = useMemo(() => {
    if (!snapshot?.ratings) return [];
    
    let ratings = [...snapshot.ratings];
    
    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      ratings = ratings.filter(team =>
        team.teamName.toLowerCase().includes(search) ||
        (team.conference && team.conference.toLowerCase().includes(search))
      );
    }
    
    // Sort
    ratings.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'name':
          comparison = a.teamName.localeCompare(b.teamName);
          break;
        case 'games':
          comparison = a.gamesProcessed - b.gamesProcessed;
          break;
        case 'change':
          comparison = (a.rating - a.initialRating) - (b.rating - b.initialRating);
          break;
        case 'initial':
          comparison = a.initialRating - b.initialRating;
          break;
      }
      return sortDir === 'desc' ? -comparison : comparison;
    });
    
    return ratings;
  }, [snapshot?.ratings, searchTerm, sortBy, sortDir]);

  const toggleSort = (column: RatingsSortField) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDir(column === 'name' ? 'asc' : 'desc');
    }
  };

  const toggleTeamExpanded = (teamName: string) => {
    setExpandedTeams(prev => {
      const newSet = new Set(prev);
      if (newSet.has(teamName)) {
        newSet.delete(teamName);
      } else {
        newSet.add(teamName);
      }
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

  return (
    <>
      {/* Search + Export */}
      <div className="p-4 border-b border-gray-200 flex items-center gap-2">
        <input
          type="text"
          placeholder="Search teams or conferences..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            const escapeCSV = (v: string | number | null) => {
              if (v === null || v === undefined) return '';
              const s = String(v);
              return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
            };
            const header = ['Rank', 'Team', 'Conference', 'Rating', 'Initial', 'Initial Rank', 'Change', 'Games', 'Date', 'Opponent', 'Location', 'Neutral', 'Team Rating Before', 'Opp Rating Before', 'HCA', 'Projected Spread', 'Closing Spread', 'Rating After', 'Impact'];
            const rows: string[][] = [];
            filteredRatings.forEach((team, index) => {
              const rank = sortBy === 'rating'
                ? (sortDir === 'desc' ? index + 1 : filteredRatings.length - index)
                : snapshot.ratings.findIndex(r => r.teamName === team.teamName) + 1;
              const change = team.rating - team.initialRating;
              const teamGames = teamAdjustmentsMap.get(team.teamName) || [];
              if (teamGames.length === 0) {
                rows.push([
                  String(rank), team.teamName, team.conference || '', team.rating.toFixed(2),
                  team.initialRating.toFixed(2), String(initialRankMap.get(team.teamName) || ''),
                  change.toFixed(2), String(team.gamesProcessed),
                  '', '', '', '', '', '', '', '', '', '', '',
                ].map(escapeCSV));
              } else {
                teamGames.forEach((adj) => {
                  const details = getTeamGameDetails(adj, team.teamName);
                  const oppRating = details.isHome ? adj.awayRatingBefore : adj.homeRatingBefore;
                  const hcaApplied = adj.isNeutralSite ? 0 : (details.isHome ? hca : -hca);
                  const teamSpread = details.isHome ? adj.projectedSpread : -adj.projectedSpread;
                  const dateStr = new Date(adj.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  rows.push([
                    String(rank), team.teamName, team.conference || '', team.rating.toFixed(2),
                    team.initialRating.toFixed(2), String(initialRankMap.get(team.teamName) || ''),
                    change.toFixed(2), String(team.gamesProcessed),
                    dateStr, details.opponent, details.location, adj.isNeutralSite ? 'Y' : '',
                    details.ratingBefore.toFixed(2), oppRating.toFixed(2), hcaApplied.toFixed(1),
                    teamSpread.toFixed(1), adj.closingSpread !== null ? adj.closingSpread.toFixed(1) : '',
                    details.ratingAfter.toFixed(2), details.ratingChange.toFixed(2),
                  ].map(escapeCSV));
                });
              }
            });
            const csv = [header, ...rows].map(r => r.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `ratings_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
          }}
          disabled={filteredRatings.length === 0}
          className="hidden sm:inline-flex px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed items-center gap-1"
          title="Export ratings and game details to CSV"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Export
        </button>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="w-full">
          <thead className="bg-blue-50 sticky top-0 z-10">
            <tr>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase w-12 sm:w-16">#</th>
              <th 
                className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase cursor-pointer" 
                onClick={() => toggleSort('name')}
              >
                <span className="hidden sm:inline">Team {sortBy === 'name' && (sortDir === 'desc' ? '↓' : '↑')}</span>
                <span className="sm:hidden">Team</span>
              </th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-semibold text-blue-800 uppercase hidden sm:table-cell">Conf</th>
              <th 
                className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" 
                onClick={() => toggleSort('rating')}
              >
                <span className="hidden sm:inline">Rating</span>
                <span className="sm:hidden">Rtg</span>
                {sortBy === 'rating' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </th>
              <th 
                className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase hidden sm:table-cell cursor-pointer" 
                onClick={() => toggleSort('initial')}
              >
                Initial{sortBy === 'initial' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </th>
              <th 
                className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" 
                onClick={() => toggleSort('change')}
              >
                <span className="hidden sm:inline">Change</span>
                <span className="sm:hidden">+/-</span>
                {sortBy === 'change' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </th>
              <th 
                className="px-2 sm:px-4 py-3 text-right text-xs font-semibold text-blue-800 uppercase cursor-pointer" 
                onClick={() => toggleSort('games')}
              >
                <span className="hidden sm:inline">Games</span>
                <span className="sm:hidden">G</span>
                {sortBy === 'games' && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRatings.map((team, index) => {
              const change = team.rating - team.initialRating;
              const rank = sortBy === 'rating' 
                ? (sortDir === 'desc' ? index + 1 : filteredRatings.length - index) 
                : snapshot.ratings.findIndex(r => r.teamName === team.teamName) + 1;
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
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-900">{rank}</td>
                    <td className="px-2 sm:px-4 py-3">
                      <div className="flex items-center gap-1 sm:gap-2">
                        <TeamLogo teamName={team.teamName} logoUrl={logoUrl} />
                        <span className="font-medium text-gray-900 hidden sm:inline">{team.teamName}</span>
                        {hasGames && (
                          <span className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-sm text-gray-900 hidden sm:table-cell">{team.conference || '-'}</td>
                    <td className="px-2 sm:px-4 py-3 text-right">
                      <span className={`font-mono font-semibold ${team.rating >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatRating(team.rating)}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right text-sm text-gray-900 font-mono hidden sm:table-cell">
                      {formatRating(team.initialRating)} <span className="text-gray-900">(#{initialRankMap.get(team.teamName)})</span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right">
                      <span className={`text-sm font-mono ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {change > 0 ? '+' : ''}{change.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right text-sm text-gray-900">{team.gamesProcessed}</td>
                  </tr>
                  
                  {/* Expanded game details */}
                  {isExpanded && hasGames && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50 px-4 py-0">
                        <div className="py-3 pl-8 pr-4">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-900 uppercase">
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
                                const teamRating = details.ratingBefore;
                                const oppRating = details.isHome ? adj.awayRatingBefore : adj.homeRatingBefore;
                                const hcaApplied = adj.isNeutralSite ? 0 : (details.isHome ? hca : -hca);
                                const teamSpread = details.isHome ? adj.projectedSpread : -adj.projectedSpread;
                                
                                return (
                                  <tr key={adj.gameId} className="hover:bg-gray-100">
                                    <td className="py-2 text-gray-900">
                                      {new Date(adj.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </td>
                                    <td className="py-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-gray-900">{details.location}</span>
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
                                    <td className="py-2 font-mono text-xs text-gray-900">
                                      <span className="text-gray-900">{teamRating.toFixed(1)}</span>
                                      <span className="text-gray-400"> − </span>
                                      <span className="text-gray-900">{oppRating.toFixed(1)}</span>
                                      {hcaApplied !== 0 && (
                                        <>
                                          <span className="text-gray-400"> {hcaApplied > 0 ? '+' : '−'} </span>
                                          <span className={hcaApplied > 0 ? 'text-green-600' : 'text-red-600'}>
                                            {Math.abs(hcaApplied).toFixed(1)}
                                          </span>
                                        </>
                                      )}
                                      <span className="text-gray-400"> = </span>
                                      <span className={`font-medium ${teamSpread < 0 ? 'text-green-700' : teamSpread > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                                        {teamSpread > 0 ? '+' : ''}{teamSpread.toFixed(1)}
                                      </span>
                                    </td>
                                    <td className="py-2 text-right font-mono text-gray-900">{formatSpread(adj.closingSpread)}</td>
                                    <td className="py-2 text-right font-mono text-gray-900">{details.ratingBefore.toFixed(2)}</td>
                                    <td className="py-2 text-right font-mono text-gray-900">{details.ratingAfter.toFixed(2)}</td>
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
  );
}
