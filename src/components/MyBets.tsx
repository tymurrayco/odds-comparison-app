// src/components/MyBets.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { myBets, getBetStats, calculatePayout, calculateProfit, Bet, BetStatus, BetType } from '@/lib/myBets';

// Bookmaker logos mapping
const bookmakerLogos: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png'
};

export default function MyBets() {
  const [statusFilter, setStatusFilter] = useState<BetStatus | 'all'>('all');
  const [expandedBetId, setExpandedBetId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'games' | 'futures'>('games');

  // Separate bets into games and futures
  const gameBets = useMemo(() => {
    return myBets.filter(bet => 
      bet.betType === 'spread' || 
      bet.betType === 'moneyline' || 
      bet.betType === 'total' || 
      bet.betType === 'prop' ||
      bet.betType === 'parlay'  // Moved parlays to games
    );
  }, []);

  const futureBets = useMemo(() => {
    return myBets.filter(bet => 
      bet.betType === 'future'  // Only futures here now
    );
  }, []);

  // Get the right set of bets based on view
  const currentBets = viewType === 'games' ? gameBets : futureBets;

  // Calculate stats for current view
  const stats = useMemo(() => getBetStats(currentBets), [currentBets]);

  // Filter and sort bets
  const displayedBets = useMemo(() => {
    let filtered = [...currentBets];
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(bet => bet.status === statusFilter);
    }

    // Sort by event date with special logic:
    // 1. Pending games sorted by event date (upcoming first)
    // 2. Completed games sorted by event date (most recent first)
    filtered.sort((a, b) => {
      const aEventDate = new Date(a.eventDate);
      const bEventDate = new Date(b.eventDate);
      
      // Both pending: upcoming games first (ascending)
      if (a.status === 'pending' && b.status === 'pending') {
        return aEventDate.getTime() - bEventDate.getTime();
      }
      
      // One pending, one not: pending first
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      
      // Both completed: most recent first (descending)
      return bEventDate.getTime() - aEventDate.getTime();
    });

    return filtered;
  }, [currentBets, statusFilter]);

  const getStatusColor = (status: BetStatus) => {
    switch(status) {
      case 'won': return 'bg-green-100 text-green-800 border-green-200';
      case 'lost': return 'bg-red-100 text-red-800 border-red-200';
      case 'pending': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'push': return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: BetStatus) => {
    switch(status) {
      case 'won': return '✓';
      case 'lost': return '✗';
      case 'pending': return '○';
      case 'push': return '—';
    }
  };

  const getBetTypeLabel = (type: BetType) => {
    switch(type) {
      case 'spread': return 'Spread';
      case 'moneyline': return 'ML';
      case 'total': return 'O/U';
      case 'prop': return 'Prop';
      case 'parlay': return 'Parlay';
      case 'future': return 'Future';
    }
  };

  const formatOdds = (odds: number) => {
    return odds > 0 ? `+${odds}` : odds.toString();
  };

  const formatDate = (dateString: string, showYear: boolean = false) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if it's today or tomorrow
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    }
    
    // Otherwise show date
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: showYear || date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const formatTimeRemaining = (eventDate: string): string | null => {
    const now = new Date();
    const event = new Date(eventDate);
    const diff = event.getTime() - now.getTime();
    
    if (diff < 0) return null; // Event has passed
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) {
      return 'Soon';
    } else if (hours < 24) {
      return `${hours}h`;
    } else if (days <= 7) {
      return `${days}d`;
    } else if (days <= 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks}w`;
    } else {
      const months = Math.floor(days / 30);
      return `${months}mo`;
    }
  };

  const formatRelativeDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) {
      return 'Just now';
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return formatDate(dateString, true);
    }
  };

  // Parse teams from description
  const parseTeams = (bet: Bet) => {
    // Don't parse teams for futures - they use the team field instead
    if (bet.betType === 'future') {
      return null;
    }
    
    // First check if awayTeam and homeTeam are explicitly set
    if (bet.awayTeam && bet.homeTeam) {
      return { away: bet.awayTeam, home: bet.homeTeam };
    }
    
    // Otherwise parse from description for game bets
    const patterns = [
      /(.+?)\s*@\s*(.+)/,
      /(.+?)\s*vs\.?\s*(.+)/i,
      /(.+?)\s+\bat\b\s+(.+)/i  // \b ensures "at" is a complete word
    ];
    
    for (const pattern of patterns) {
      const match = bet.description.match(pattern);
      if (match) {
        return { away: match[1].trim(), home: match[2].trim() };
      }
    }
    return null;
  };

  const getTeamLogo = (teamName: string) => {
    // Simple approach: lowercase, remove spaces, add .png
    // For "Texas Longhorns" → "texaslonghorns.png"
    // For "Ohio State Buckeyes" → "ohiostatebuckeyes.png"
    const cleanName = teamName.toLowerCase().replace(/\s+/g, '');
    return `/team-logos/${cleanName}.png`;
  };

  const toggleExpanded = (betId: string) => {
    setExpandedBetId(expandedBetId === betId ? null : betId);
  };

  // Get overall stats (for both views combined)
  const overallStats = useMemo(() => getBetStats(myBets), []);

  return (
    <div className="space-y-4">
      {/* View Toggle */}
      <div className="bg-white rounded-lg shadow p-2">
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => {
              setViewType('games');
              setStatusFilter('all');
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewType === 'games'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Games/Parlays ({gameBets.length})
          </button>
          <button
            onClick={() => {
              setViewType('futures');
              setStatusFilter('all');
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewType === 'futures'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Futures ({futureBets.length})
          </button>
        </div>
      </div>

      {/* Compact Stats Bar */}
      <div className="bg-white rounded-lg shadow p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-4">
            <span className="font-bold">
              {stats.wonBets}-{stats.lostBets}-{stats.pushBets}
            </span>
            <span className="text-gray-500">
              {stats.winRate.toFixed(0)}% Win
            </span>
            <span className={`font-medium ${stats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.profit >= 0 ? '+' : ''}{stats.profit.toFixed(2)} units
            </span>
            <span className="text-gray-500">
              {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}% ROI
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-blue-600 font-medium">
              {stats.pendingBets} pending
            </span>
            <span className="text-gray-500">
              ({stats.pendingStake.toFixed(2)} units)
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-lg shadow p-2">
        <div className="flex gap-1 overflow-x-auto">
          {(['all', 'pending', 'won', 'lost'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === status 
                  ? status === 'pending' ? 'bg-blue-600 text-white'
                    : status === 'won' ? 'bg-green-600 text-white'
                    : status === 'lost' ? 'bg-red-600 text-white'
                    : 'bg-gray-700 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status === 'all' ? `All (${stats.totalBets})` :
               status === 'pending' ? `Pending (${stats.pendingBets})` :
               status === 'won' ? `Won (${stats.wonBets})` :
               `Lost (${stats.lostBets})`}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Bets List */}
      <div className="space-y-2">
        {displayedBets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No {viewType} bets found {statusFilter !== 'all' ? `with status: ${statusFilter}` : ''}
          </div>
        ) : (
          <>
            {displayedBets.map((bet, index) => {
              const teams = parseTeams(bet);
              // For futures and single-team parlays, check for team field
              const futureTeam = (bet.betType === 'future' || (bet.betType === 'parlay' && !teams)) 
                ? bet.team 
                : null;
              const isExpanded = expandedBetId === bet.id;
              const profit = bet.status === 'won' ? calculateProfit(bet.stake, bet.odds) : 
                           bet.status === 'lost' ? -bet.stake : 0;
              
              // Check if we need a divider between pending and completed
              const showDivider = index > 0 && 
                displayedBets[index - 1].status === 'pending' && 
                bet.status !== 'pending';
              
              return (
                <React.Fragment key={bet.id}>
                  {showDivider && (
                    <div className="flex items-center gap-2 my-3">
                      <div className="flex-1 h-px bg-gray-200"></div>
                      <span className="text-xs text-gray-500 px-2">Completed</span>
                      <div className="flex-1 h-px bg-gray-200"></div>
                    </div>
                  )}
                  <div className={`bg-white rounded-lg shadow hover:shadow-md transition-shadow ${
                    bet.status === 'pending' && formatTimeRemaining(bet.eventDate) === 'Soon' ? 'ring-2 ring-blue-400' : ''
                  }`}>
                    {/* Main Bet Row - All on One Line */}
                    <div 
                      className="p-3 cursor-pointer"
                      onClick={() => toggleExpanded(bet.id)}
                    >
                      <div className="flex items-center gap-2">
                        {/* Status Icon */}
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getStatusColor(bet.status)}`}>
                          {getStatusIcon(bet.status)}
                        </div>

                        {/* Event Date - Shows prominently */}
                        <div className="flex flex-col items-start min-w-[52px]">
                          <span className="text-xs font-medium text-gray-700">
                            {formatDate(bet.eventDate)}
                          </span>
                          {bet.status === 'pending' && formatTimeRemaining(bet.eventDate) && (
                            <span className="text-xs text-blue-500 font-medium">
                              {formatTimeRemaining(bet.eventDate)}
                            </span>
                          )}
                        </div>

                        {/* Sport/League Badge */}
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                          {bet.league}
                        </span>

                        {/* Teams/Description with Logos (if available) */}
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          {teams ? (
                            <>
                              <img 
                                src={getTeamLogo(teams.away)}
                                alt=""
                                className="h-4 w-4"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <span className="text-sm truncate">{teams.away}</span>
                              <span className="text-xs text-gray-400">@</span>
                              <img 
                                src={getTeamLogo(teams.home)}
                                alt=""
                                className="h-4 w-4"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <span className="text-sm truncate">{teams.home}</span>
                            </>
                          ) : futureTeam ? (
                            <>
                              <img 
                                src={getTeamLogo(futureTeam)}
                                alt=""
                                className="h-4 w-4"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <span className="text-sm truncate">{bet.description}</span>
                            </>
                          ) : (
                            <span className="text-sm truncate">{bet.description}</span>
                          )}
                        </div>

                        {/* Bet Type */}
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 rounded text-blue-700 font-medium">
                          {getBetTypeLabel(bet.betType)}
                        </span>

                        {/* The Bet - Show abbreviated for futures */}
                        <span className="text-sm font-bold text-blue-600 min-w-[80px] text-right truncate">
                          {viewType === 'futures' && bet.bet.length > 25 
                            ? bet.bet.substring(0, 25) + '...' 
                            : bet.bet}
                        </span>

                        {/* Odds */}
                        <span className="text-xs text-gray-500 min-w-[40px] text-right">
                          {formatOdds(bet.odds)}
                        </span>

                        {/* Book Logo */}
                        {bet.book && bookmakerLogos[bet.book] && (
                          <img 
                            src={bookmakerLogos[bet.book]}
                            alt={bet.book}
                            className="h-5 w-auto"
                          />
                        )}

                        {/* Profit/Loss Indicator */}
                        {bet.status !== 'pending' && (
                          <span className={`text-xs font-medium min-w-[45px] text-right ${
                            profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {profit > 0 ? '+' : ''}{profit !== 0 ? profit.toFixed(2) : 'Push'}
                          </span>
                        )}

                        {/* Expand Arrow */}
                        <svg 
                          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                        <div className="mt-2 space-y-1 text-xs">
                          {/* Show full bet description for parlays */}
                          {bet.betType === 'parlay' && (
                            <div className="mb-2 p-2 bg-blue-50 rounded">
                              <span className="font-medium text-blue-800">Full Parlay:</span>
                              <span className="block mt-1 text-blue-700">{bet.bet}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-500">Bet placed:</span>
                            <span>{formatRelativeDate(bet.date)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Event date:</span>
                            <span>{formatDate(bet.eventDate, true)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Stake:</span>
                            <span>{bet.stake} units</span>
                          </div>
                          {bet.status === 'pending' ? (
                            <div className="flex justify-between">
                              <span className="text-gray-500">To Win:</span>
                              <span className="text-blue-600">
                                {calculateProfit(bet.stake, bet.odds).toFixed(2)} units
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Result:</span>
                              <span className={profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-600'}>
                                {profit > 0 ? '+' : ''}{profit.toFixed(2)} units
                              </span>
                            </div>
                          )}
                          {bet.result && bet.result !== 'pending' && (
                            <div className="flex justify-between">
                              <span className="text-gray-500">Score:</span>
                              <span>{bet.result}</span>
                            </div>
                          )}
                          {bet.notes && (
                            <div className="mt-2 p-2 bg-gray-50 rounded">
                              <span className="text-gray-600 italic">{bet.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      {/* Quick Stats Summary */}
      {stats.pendingBets > 0 && (
        <div className="bg-blue-50 rounded-lg p-3 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-blue-700">
              Pending: {stats.pendingStake.toFixed(2)} units at risk
            </span>
            <span className="text-blue-700 font-medium">
              Potential return: {(stats.pendingPotentialPayout).toFixed(2)} units 
              (+{stats.pendingPotentialProfit.toFixed(2)})
            </span>
          </div>
        </div>
      )}

      {/* Overall Stats Summary (optional - shows combined stats) */}
      <div className="bg-gray-50 rounded-lg p-3 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">
            Overall: {overallStats.totalBets} bets • {overallStats.wonBets}W-{overallStats.lostBets}L-{overallStats.pushBets}P
          </span>
          <span className="text-gray-700 font-medium">
            Total pending: {overallStats.pendingStake.toFixed(2)} units
          </span>
        </div>
      </div>
    </div>
  );
}