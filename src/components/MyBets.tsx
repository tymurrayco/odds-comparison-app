// src/components/MyBets.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { myBets, getBetStats, calculateProfit, Bet, BetStatus, BetType } from '@/lib/myBets';

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
    return filtered.sort((a, b) => {
      const dateA = new Date(a.eventDate).getTime();
      const dateB = new Date(b.eventDate).getTime();
      
      // Both pending: earlier event first
      if (a.status === 'pending' && b.status === 'pending') {
        return dateA - dateB;
      }
      
      // One pending, one not: pending first
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      
      // Both completed: more recent first
      return dateB - dateA;
    });
  }, [currentBets, statusFilter]);

  // Helper functions
  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'won': return 'bg-green-100 text-green-700 border-green-200';
      case 'lost': return 'bg-red-100 text-red-700 border-red-200';
      case 'push': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'pending': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusIcon = (status: BetStatus): string => {
    switch (status) {
      case 'won': return '✓';
      case 'lost': return '✗';
      case 'push': return '—';
      case 'pending': return '○';
      default: return '?';
    }
  };

  const formatOdds = (odds: number): string => {
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  const formatDate = (dateString: string, includeTime: boolean = false): string => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    if (isToday) {
      return includeTime ? `Today ${date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      })}` : 'Today';
    }
    
    if (isTomorrow) {
      return includeTime ? `Tomorrow ${date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit' 
      })}` : 'Tomorrow';
    }
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      ...(includeTime && { 
        hour: 'numeric', 
        minute: '2-digit' 
      })
    });
  };

  const getBetTypeLabel = (betType: BetType): string => {
    switch (betType) {
      case 'spread': return 'Spread';
      case 'moneyline': return 'ML';
      case 'total': return 'Total';
      case 'future': return 'Future';
      case 'prop': return 'Prop';
      case 'parlay': return 'Parlay';
      default: return betType;
    }
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
                  ? status === 'pending' ? 'bg-blue-600 text-white' :
                    status === 'won' ? 'bg-green-600 text-white' :
                    status === 'lost' ? 'bg-red-600 text-white' :
                    'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
              <span className="ml-1">
                ({status === 'all' ? currentBets.length :
                  currentBets.filter(b => b.status === status).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Bets List */}
      <div className="space-y-2">
        {displayedBets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {statusFilter === 'all' 
              ? `No ${viewType === 'games' ? 'game bets or parlays' : 'futures'} placed yet.`
              : `No ${statusFilter} ${viewType === 'games' ? 'game bets or parlays' : 'futures'}.`}
          </div>
        ) : (
          displayedBets.map(bet => {
            const isExpanded = expandedBetId === bet.id;
            const profit = calculateProfit(bet.stake, bet.odds, bet.status);
            const teams = parseTeams(bet);
            const futureTeam = bet.betType === 'future' ? bet.team : null;

            return (
              <div key={bet.id}>
                <div className={`bg-white rounded-lg shadow border-l-4 transition-all duration-200 ${
                  getStatusColor(bet.status).split(' ')[2]
                } ${
                  bet.status === 'pending' && formatTimeRemaining(bet.eventDate) === 'Soon' 
                    ? 'ring-2 ring-blue-400' : ''
                }`}>
                  {/* Main Bet Row - Mobile Optimized */}
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
                      <div className="flex flex-col items-start min-w-[48px] sm:min-w-[52px]">
                        <span className="text-xs font-medium text-gray-700">
                          {formatDate(bet.eventDate)}
                        </span>
                        {bet.status === 'pending' && formatTimeRemaining(bet.eventDate) && (
                          <span className="text-xs text-blue-500 font-medium">
                            {formatTimeRemaining(bet.eventDate)}
                          </span>
                        )}
                      </div>

                      {/* Sport/League Badge - Hidden on mobile for games/parlays */}
                      {(viewType === 'futures' || window.innerWidth >= 640) && (
                        <span className="hidden sm:inline-flex text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                          {bet.league}
                        </span>
                      )}

                      {/* Teams/Description with Logos - Mobile optimized */}
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        {viewType === 'games' && teams ? (
                          <>
                            {/* Mobile: Show logos only or with abbreviated names */}
                            <div className="flex sm:hidden items-center gap-1">
                              <img 
                                src={getTeamLogo(teams.away)}
                                alt=""
                                className="h-5 w-5"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <span className="text-xs text-gray-400">@</span>
                              <img 
                                src={getTeamLogo(teams.home)}
                                alt=""
                                className="h-5 w-5"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            </div>
                            
                            {/* Desktop: Show full team names with logos */}
                            <div className="hidden sm:flex items-center gap-1">
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
                            </div>
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

                      {/* The Bet - Show abbreviated on mobile */}
                      <span className="text-sm font-bold text-blue-600 min-w-[60px] sm:min-w-[80px] text-right truncate">
                        {/* Show shorter version on mobile */}
                        <span className="sm:hidden">
                          {bet.bet.length > 15 ? bet.bet.substring(0, 15) + '...' : bet.bet}
                        </span>
                        <span className="hidden sm:inline">
                          {viewType === 'futures' && bet.bet.length > 25 
                            ? bet.bet.substring(0, 25) + '...' 
                            : bet.bet}
                        </span>
                      </span>

                      {/* Odds - Hidden on mobile for games/parlays */}
                      {(viewType === 'futures' || window.innerWidth >= 640) && (
                        <span className="hidden sm:inline text-xs text-gray-500 min-w-[40px] text-right">
                          {formatOdds(bet.odds)}
                        </span>
                      )}

                      {/* Book Logo - Always visible */}
                      {bet.book && bookmakerLogos[bet.book] && (
                        <img 
                          src={bookmakerLogos[bet.book]}
                          alt={bet.book}
                          className="h-4 sm:h-5 w-auto"
                        />
                      )}

                      {/* Profit/Loss Indicator - Always visible for completed bets */}
                      {bet.status !== 'pending' && (
                        <span className={`text-xs font-medium min-w-[40px] sm:min-w-[45px] text-right ${
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
                        
                        {/* Show full team names on mobile when expanded */}
                        {viewType === 'games' && teams && (
                          <div className="sm:hidden mb-2 p-2 bg-gray-50 rounded">
                            <span className="font-medium text-gray-800">Game:</span>
                            <span className="block mt-1 text-gray-700">
                              {teams.away} @ {teams.home}
                            </span>
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
                        <div className="flex justify-between">
                          <span className="text-gray-500">Odds:</span>
                          <span>{formatOdds(bet.odds)}</span>
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
                            <span className={profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-gray-500'}>
                              {profit > 0 ? `+${profit.toFixed(2)}` : profit < 0 ? profit.toFixed(2) : 'Push'} units
                            </span>
                          </div>
                        )}
                        {bet.notes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded">
                            <span className="font-medium text-gray-700">Notes:</span>
                            <p className="mt-1 text-gray-600">{bet.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}