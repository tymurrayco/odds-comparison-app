// src/components/MyBets.tsx
// Updated to fetch from Supabase while keeping ALL existing functionality
// NOW WITH LEAGUE-SPECIFIC STATISTICS

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { fetchBets, fetchBetsOf, getBetStats, calculateProfit, Bet, BetStatus, BetType } from '@/lib/betService';
import { listFollowing, type Profile } from '@/lib/social';
import LiveTag from '@/components/LiveTag';
import BetEditSheet from '@/components/BetEditSheet';

// Bookmaker logos mapping - KEPT FROM YOUR ORIGINAL
const bookmakerLogos: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png',
  'Caesars': '/bookmaker-logos/caesars.png',
  'BetOnline.ag': '/bookmaker-logos/betonline.png',
  'Kalshi': '/bookmaker-logos/kalshi.png',
  'Novig': '/bookmaker-logos/novig.png',
  'ProphetX': '/bookmaker-logos/prophetx.png',
    'Polymarket': '/bookmaker-logos/polymarket.png'
};

// Team logo/color data from ESPN — same source and card treatment as the Bet Admin view.
interface BetTeamInfo {
  displayName: string;
  logo: string;
  color: string;          // hex without leading #
  alternateColor?: string;
  abbreviation?: string;  // ESPN abbreviation, e.g., "KC", "TEX"
}

// Keep in sync with src/app/api/bet-team-logos/route.ts (duplicated to avoid
// importing server code from a client component).
const normalizeTeamKey = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Leagues with team color/logo data (ESPN, plus a static CFL table in the route).
// Excluded: UFC, PGA, Tennis, MMA, Golf, Soccer.
const SUPPORTED_LEAGUES = new Set(['NFL', 'NCAAF', 'NBA', 'NCAAB', 'MLB', 'NHL', 'CFL']);

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// One line of the league-stats unfurl (division split or week): record,
// win rate, units, pending. Clickable when it unfurls further. `week` rows
// are tighter (narrower label, pending only when non-zero) so "2025 Conf
// Champ 4-3-0 57% Win +0.66u" still fits one phone line.
function SubStatRow({
  label, stats: s, onClick, title, week,
}: {
  label: string;
  stats: ReturnType<typeof getBetStats>;
  onClick?: () => void;
  title?: string;
  week?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 text-[11px] ${onClick ? 'cursor-pointer select-none' : ''}`}
      role={onClick ? 'button' : undefined}
      title={title}
      onClick={onClick}
    >
      <div className={`flex items-center ${week ? 'gap-2' : 'gap-3'} min-w-0`}>
        <span className={`font-medium whitespace-nowrap ${week ? 'min-w-[56px] text-gray-500' : 'min-w-[80px] text-gray-600'}`}>{label}</span>
        <span className="font-medium whitespace-nowrap">{s.wonBets}-{s.lostBets}-{s.pushBets}</span>
        <span className="text-gray-500 whitespace-nowrap">{s.winRate.toFixed(0)}% Win</span>
        <span className={`font-medium whitespace-nowrap ${s.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {s.profit >= 0 ? '+' : ''}{s.profit.toFixed(2)}u
        </span>
      </div>
      {(!week || s.pendingBets > 0) && (
        <span className="text-gray-400 whitespace-nowrap shrink-0">{s.pendingBets} pending</span>
      )}
    </div>
  );
}

// Logo with fallback chain: ESPN first, then the legacy local file, then hidden.
function TeamLogoImg({ srcs, className }: { srcs: string[]; className: string }) {
  const [idx, setIdx] = useState(0);
  const src = srcs[idx];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} onError={() => setIdx(i => i + 1)} />
  );
}

export type BetYearFilter = number | 'all';

interface MyBetsProps {
  /** Year of the bet's event date to show, or 'all' for all-time (default). */
  yearFilter?: BetYearFilter;
  /** Reports the distinct event years present in the loaded bets (newest first). */
  onYearsLoaded?: (years: number[]) => void;
}

export default function MyBets({ yearFilter = 'all', onYearsLoaded }: MyBetsProps = {}) {
  // NEW: State for Supabase data
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // KEPT: All your existing state
  // 'settled' = won + lost + push (anything that is no longer pending)
  const [statusFilter, setStatusFilter] = useState<BetStatus | 'all' | 'settled'>('pending');
  // Game bets placed live (after kickoff) vs before; the record and profit
  // summary, the splits and the list all follow it
  const [timing, setTiming] = useState<'all' | 'pregame' | 'live'>('all');
  const [expandedBetId, setExpandedBetId] = useState<string | null>(null);
  const [copiedBetId, setCopiedBetId] = useState<string | null>(null);
  // Bet open in the edit sheet (text / odds / stake / result / delete)
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [viewType, setViewType] = useState<'games' | 'futures'>('games');

  // Kickoff times for pending bets. A bet stores the DAY of its game only, so
  // the hour comes from /api/kickoffs (the league's upcoming games), matched
  // on the two teams and the day. Key: bet id → kickoff in ms.
  const [kickoffs, setKickoffs] = useState<Record<string, number>>({});
  useEffect(() => {
    const pending = myBets.filter((b) => b.status === 'pending' && b.betType !== 'future');
    const leagues = Array.from(new Set(pending.map((b) => b.league)));
    if (leagues.length === 0) return;
    let cancelled = false;
    const localDay = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    Promise.all(
      leagues.map(async (lg) => {
        try {
          const resp = await fetch(`/api/kickoffs?league=${encodeURIComponent(lg)}`);
          const data = resp.ok ? await resp.json() : { games: [] };
          return [lg, (data.games ?? []) as { home: string; away: string; commence: string }[]] as const;
        } catch {
          return [lg, [] as { home: string; away: string; commence: string }[]] as const;
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const byLeague = new Map(results);
      const found: Record<string, number> = {};
      for (const bet of pending) {
        const names = [bet.homeTeam, bet.awayTeam, bet.team].filter((n): n is string => !!n).map(normalizeTeamKey);
        if (names.length === 0) continue;
        const game = (byLeague.get(bet.league) ?? []).find((g) => {
          const at = new Date(g.commence).getTime();
          if (localDay(at) !== bet.eventDate) return false;
          const teams = [normalizeTeamKey(g.home), normalizeTeamKey(g.away)];
          return names.every((n) => teams.includes(n));
        });
        if (game) found[bet.id] = new Date(game.commence).getTime();
      }
      setKickoffs(found);
    });
    return () => {
      cancelled = true;
    };
  }, [myBets]);
  // When a bet's game starts: the real kickoff when known, else the end of its
  // day — so on a shared day the bets with a known time come first, in order
  const startsAt = (bet: Bet): number => kickoffs[bet.id] ?? new Date(bet.eventDate + 'T23:59:00').getTime();

  // Team logo/color maps per league (lazy-loaded, same as Bet Admin)
  const [teamMaps, setTeamMaps] = useState<Record<string, Record<string, BetTeamInfo>>>({});

  useEffect(() => {
    const needed = Array.from(new Set(myBets.map(b => b.league)))
      .filter(lg => SUPPORTED_LEAGUES.has(lg) && !teamMaps[lg]);
    if (needed.length === 0) return;
    let cancelled = false;
    Promise.all(needed.map(async lg => {
      try {
        const resp = await fetch(`/api/bet-team-logos?league=${lg}`);
        if (!resp.ok) return [lg, {}] as const;
        const data = await resp.json();
        return [lg, data.teams as Record<string, BetTeamInfo>] as const;
      } catch {
        return [lg, {}] as const;
      }
    })).then(results => {
      if (cancelled) return;
      setTeamMaps(prev => {
        const next = { ...prev };
        for (const [lg, map] of results) next[lg] = map;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [myBets, teamMaps]);

  // Whose bets are showing: null = mine, else someone I follow (read-only)
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [followed, setFollowed] = useState<Profile[]>([]);
  useEffect(() => {
    listFollowing().then((edges) => setFollowed(edges.filter((e) => e.status === 'accepted').map((e) => e.profile)));
  }, []);

  // Fetch bets on mount and whenever the person being viewed changes
  useEffect(() => {
    loadBets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id]);

  const loadBets = async () => {
    try {
      setLoading(true);
      setError(null);
      setExpandedBetId(null);
      const fetchedBets = viewing ? await fetchBetsOf(viewing.id) : await fetchBets();
      setMyBets(fetchedBets);
    } catch (err) {
      console.error('Error loading bets:', err);
      setError('Failed to load bets. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Year filter (event-date year, string compare so UTC offsets can't shift the year)
  const betYear = (bet: Bet): number => parseInt(String(bet.eventDate).substring(0, 4), 10);
  const yearBets = useMemo(() => {
    if (yearFilter === 'all') return myBets;
    return myBets.filter(bet => betYear(bet) === yearFilter);
  }, [myBets, yearFilter]);
  useEffect(() => {
    if (!onYearsLoaded) return;
    const years = Array.from(new Set(myBets.map(betYear).filter(y => !Number.isNaN(y)))).sort((a, b) => b - a);
    onYearsLoaded(years);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myBets]);

  // KEPT: Separate bets into games and futures (updated to include teasers with games)
  const allGameBets = useMemo(() => {
    return yearBets.filter(bet => 
      bet.betType === 'spread' || 
      bet.betType === 'moneyline' || 
      bet.betType === 'total' || 
      bet.betType === 'team_total' ||
      bet.betType === 'prop' ||
      bet.betType === 'parlay' ||
      bet.betType === 'teaser'  // Added teasers to games
    );
  }, [yearBets]);
  const hasLiveBets = useMemo(() => allGameBets.some((bet) => bet.live), [allGameBets]);
  const gameBets = useMemo(
    () => (timing === 'all' ? allGameBets : allGameBets.filter((bet) => !!bet.live === (timing === 'live'))),
    [allGameBets, timing]
  );

  const futureBets = useMemo(() => {
    return yearBets.filter(bet => 
      bet.betType === 'future'  // Only futures here now
    );
  }, [yearBets]);

  // KEPT: Get the right set of bets based on view
  const currentBets = viewType === 'games' ? gameBets : futureBets;

  // KEPT: Calculate stats for current view
  const stats = useMemo(() => getBetStats(currentBets), [currentBets]);

  // NEW: Calculate stats by league for games view
  const statsByLeague = useMemo(() => {
    if (viewType !== 'games') return {};
    
    // Group bets by league
    const leagueGroups: { [league: string]: Bet[] } = {};
    currentBets.forEach(bet => {
      if (!leagueGroups[bet.league]) {
        leagueGroups[bet.league] = [];
      }
      leagueGroups[bet.league].push(bet);
    });
    
    // Calculate stats for each league
    const leagueStats: { [league: string]: ReturnType<typeof getBetStats> } = {};
    Object.entries(leagueGroups).forEach(([league, bets]) => {
      leagueStats[league] = getBetStats(bets);
    });
    
    // Sort leagues by total number of bets (most bets first)
    const sortedLeagues = Object.entries(leagueStats)
      .sort((a, b) => b[1].totalBets - a[1].totalBets);
    
    return Object.fromEntries(sortedLeagues);
  }, [currentBets, viewType]);

  // KEPT: Filter and sort bets (exactly as you had it)
  const displayedBets = useMemo(() => {
    let filtered = [...currentBets];
    
    // Apply status filter
    if (statusFilter === 'settled') {
      filtered = filtered.filter(bet => bet.status !== 'pending');
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(bet => bet.status === statusFilter);
    }

    // Sort by event date with special logic:
    // 1. Pending games sorted by event date (upcoming first)
    // 2. Completed games sorted by event date (most recent first)
    return filtered.sort((a, b) => {
      const dateA = new Date(a.eventDate).getTime();
      const dateB = new Date(b.eventDate).getTime();
      
      // Both pending: earlier kickoff first
      if (a.status === 'pending' && b.status === 'pending') {
        return startsAt(a) - startsAt(b);
      }
      
      // One pending, one not: pending first
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      
      // Both completed: more recent first
      return dateB - dateA;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBets, statusFilter, kickoffs]);

  // KEPT: All your helper functions exactly as they were
  const getStatusColor = (status: BetStatus): string => {
    switch (status) {
      case 'won': return 'bg-green-100 text-green-700 border-green-200';
      case 'lost': return 'bg-red-100 text-red-700 border-red-200';
      case 'push': return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'pending': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // UPDATED: Simplified to only use league for icon selection
  const getStatusIcon = (status: BetStatus, sport?: string, league?: string): string => {
    switch (status) {
      case 'won': return '✔';
      case 'lost': return '✗';
      case 'push': return '—';
      case 'pending': 
        const leagueLower = league?.toLowerCase() || '';
        
        // Use league only - it's the most reliable
        if (leagueLower.includes('nhl')) return '🏒';
        if (leagueLower.includes('ncaab') || leagueLower.includes('nba') || leagueLower.includes('wnba')) return '🏀';
        if (leagueLower.includes('ncaaf') || leagueLower.includes('nfl') || leagueLower.includes('cfl')) return '🏈';
        if (leagueLower.includes('mlb')) return '⚾';
        if (leagueLower.includes('mls') || leagueLower.includes('epl')) return '⚽';
        if (leagueLower.includes('pga')) return '⛳';
        if (leagueLower.includes('ufc')) return '🥊';
        
        return '○';
      default: return '?';
    }
  };

  const formatOdds = (odds: number): string => {
    if (odds > 0) return `+${odds}`;
    return odds.toString();
  };

  const formatDate = (dateString: string, includeTime: boolean = false): string => {
    // Parse as local date by adding time component to avoid UTC interpretation
    const date = new Date(dateString + 'T00:00:00');
    const now = new Date();
    
    // Set both dates to start of day for comparison
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    
    const isToday = dateStart.getTime() === todayStart.getTime();
    const isTomorrow = dateStart.getTime() === tomorrowStart.getTime();
    
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
      case 'team_total': return 'Team Total';
      case 'future': return 'Future';
      case 'prop': return 'Prop';
      case 'parlay': return 'Parlay';
      case 'teaser': return 'Teaser';
      default: return betType;
    }
  };

  // Time to go: counted to the real kickoff when it is known (see kickoffs),
  // else to the start of the game's day as before
  const formatTimeRemaining = (eventDate: string, kickoff?: number): string | null => {
    // Parse as local date by adding time component
    const event = new Date(eventDate + 'T00:00:00');
    const now = new Date();
    
    // Set event to start of its day for consistent comparison
    const eventStart = new Date(event.getFullYear(), event.getMonth(), event.getDate());
    const nowTime = now.getTime();
    
    const diff = (kickoff ?? eventStart.getTime()) - nowTime;
    
    if (diff < 0) return null; // Event has passed
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (hours < 1) {
      // under an hour to a known kickoff: say how long
      return kickoff ? `${Math.max(1, Math.round(diff / 60000))}m` : 'Soon';
    } else if (hours < 24) {
      return `${hours}h`;
    } else if (days === 1) {
      return '1d';  // More accurate for exactly 1 day
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
    // Parse as local date
    const date = new Date(dateString + 'T00:00:00');
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

  // UPDATED: Parse teams from description with support for teasers
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
      /(.+?)\s+\bat\b\s+(.+)/i,  // \b ensures "at" is a complete word
      /(.+?)\s*&\s*(.+)/i,  // Added pattern for teasers
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

  const lookupTeamInfo = (league: string, name?: string | null): BetTeamInfo | null => {
    if (!name) return null;
    const map = teamMaps[league];
    if (!map) return null;
    return map[normalizeTeamKey(name)] ?? null;
  };

  // NCAAF sub-records: FBS-vs-FBS, FBS-vs-FCS and FCS-vs-FCS, classified by
  // the Ledger ratings' ESPN names (one fetch, cached). Tap the NCAAF row in
  // the league stats to unfurl them.
  const [divisions, setDivisions] = useState<{ fbs: Set<string>; fcs: Set<string> } | null>(null);
  useEffect(() => {
    if (divisions || !currentBets.some((b) => b.league === 'NCAAF')) return;
    fetch('/api/fbs/divisions')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.success) return;
        setDivisions({
          fbs: new Set((j.fbs as string[]).map(normalizeTeamKey)),
          fcs: new Set((j.fcs as string[]).map(normalizeTeamKey)),
        });
      })
      .catch(() => {});
  }, [divisions, currentBets]);
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);
  const ncaafSplits = useMemo(() => {
    if (!divisions) return null;
    const groups: Record<string, Bet[]> = { FBS: [], 'FBS vs FCS': [], FCS: [], Unmatched: [] };
    const cls = (n?: string) => {
      if (!n) return null;
      const k = normalizeTeamKey(n);
      return divisions.fbs.has(k) ? 'fbs' : divisions.fcs.has(k) ? 'fcs' : null;
    };
    for (const bet of currentBets) {
      if (bet.league !== 'NCAAF') continue;
      const teams = parseTeams(bet);
      const a = cls(teams?.away);
      const h = cls(teams?.home);
      const key = a && h ? (a === h ? (a === 'fbs' ? 'FBS' : 'FCS') : 'FBS vs FCS') : 'Unmatched';
      groups[key].push(bet);
    }
    return Object.entries(groups)
      .filter(([, b]) => b.length > 0)
      .map(([label, b]) => ({ label, stats: getBetStats(b), bets: b }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, currentBets]);

  // Week-by-week records (NFL row, and each NCAAF split). Weeks come from
  // ESPN's season calendar via /api/football-weeks (one fetch per league +
  // season, cached); a bet whose date no calendar covers falls back to a
  // Tue→Mon bucket labelled by its Tuesday.
  interface WeekRange { label: string; start: string; end: string }
  const [weekCalendars, setWeekCalendars] = useState<Record<string, WeekRange[]>>({});
  const requestedCalendars = React.useRef<Set<string>>(new Set());
  // Jan/Feb games belong to the season that started the previous fall.
  const candidateSeasons = (eventDate: string): number[] => {
    const y = parseInt(String(eventDate).substring(0, 4), 10);
    const m = parseInt(String(eventDate).substring(5, 7), 10);
    if (!Number.isFinite(y)) return [];
    return m <= 2 ? [y - 1, y] : [y];
  };
  useEffect(() => {
    const keys = new Set<string>();
    for (const b of currentBets) {
      if (b.league !== 'NFL' && b.league !== 'NCAAF') continue;
      for (const s of candidateSeasons(b.eventDate)) keys.add(`${b.league}:${s}`);
    }
    for (const key of keys) {
      if (requestedCalendars.current.has(key)) continue;
      requestedCalendars.current.add(key);
      const [league, season] = key.split(':');
      fetch(`/api/football-weeks?league=${league}&season=${season}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setWeekCalendars((prev) => ({ ...prev, [key]: (j?.weeks as WeekRange[]) ?? [] })))
        .catch(() => setWeekCalendars((prev) => ({ ...prev, [key]: [] })));
    }
  }, [currentBets]);
  const weekOf = (bet: Bet): { label: string; season: number; sort: number } => {
    const t = new Date(`${String(bet.eventDate).substring(0, 10)}T12:00:00`).getTime();
    const seasons = candidateSeasons(bet.eventDate);
    for (const s of seasons) {
      for (const w of weekCalendars[`${bet.league}:${s}`] ?? []) {
        const start = Date.parse(w.start);
        const end = Date.parse(w.end);
        if (t >= start && t < end) return { label: w.label, season: s, sort: start };
      }
    }
    // Fallback: Tuesday-to-Monday bucket in the season that started last fall
    const d = new Date(t);
    d.setDate(d.getDate() - ((d.getDay() - 2 + 7) % 7));
    d.setHours(0, 0, 0, 0);
    return {
      label: `Wk of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      season: seasons[0] ?? d.getFullYear(),
      sort: d.getTime(),
    };
  };
  // Oldest week first (Wk 1 at the top, Tyler's call 2026-10-05). When the
  // bets span more than one season the label carries the year ("2025 Super
  // Bowl" above "2026 Wk 1") so the seasons don't read as one run.
  const weekRows = (bets: Bet[]) => {
    const groups = new Map<string, { label: string; season: number; sort: number; bets: Bet[] }>();
    for (const b of bets) {
      const w = weekOf(b);
      const key = `${w.season}:${w.label}`;
      const g = groups.get(key) ?? { label: w.label, season: w.season, sort: w.sort, bets: [] };
      g.bets.push(b);
      groups.set(key, g);
    }
    const multiSeason = new Set([...groups.values()].map((g) => g.season)).size > 1;
    return [...groups.values()]
      .sort((a, b) => a.sort - b.sort)
      .map((g) => ({ label: multiSeason ? `${g.season} ${g.label}` : g.label, stats: getBetStats(g.bets) }));
  };
  // Which NCAAF split (FBS / FCS / ...) is open to its weeks
  const [expandedSplit, setExpandedSplit] = useState<string | null>(null);

  // Accent = the team the wager is on: leading tokens of the bet text (e.g.
  // "Texas -3.5" → Texas), bet.team for futures. Totals use the home team.
  // Home/away fields remain as fallbacks so cards still get a color when the
  // bet text doesn't resolve to a team.
  const getPrimaryTeamInfo = (bet: Bet): BetTeamInfo | null => {
    const teams = parseTeams(bet);
    const candidates: (string | undefined)[] = [];
    if (bet.betType === 'total') {
      candidates.push(bet.homeTeam, teams?.home);
    } else {
      const betLead = bet.bet?.match(/^([A-Za-z\u00c0-\u017f .'-]+?)(?:\s+[-+0-9]|,|$)/)?.[1]?.trim();
      const betLeadNoMl = betLead?.replace(/\s+(ml|moneyline)$/i, '').trim();
      candidates.push(
        bet.team,
        betLeadNoMl !== betLead ? betLeadNoMl : undefined,
        betLead,
        bet.parlayTeams?.[0],
        bet.homeTeam,
        bet.awayTeam,
        teams?.home,
        teams?.away,
      );
    }
    for (const c of candidates) {
      const info = lookupTeamInfo(bet.league, c);
      if (info) return info;
    }
    return null;
  };

  // Shorten team names in bet text to ESPN abbreviations so the line/spread
  // stays visible ("Texas Longhorns -3.5" -> "TEX -3.5"). Longest-prefix
  // match against the team map (up to 4 words) so "Kansas City Chiefs"
  // resolves before "Kansas" could. Parlay/teaser legs split on "&" and
  // shorten independently. Falls back to the original text when no
  // abbreviation resolves (totals like "Over 45.5", unsupported leagues).
  const abbreviateBetText = (bet: Bet): string => {
    if (!bet.bet) return bet.bet;
    const shorten = (segment: string): string => {
      const words = segment.trim().split(/\s+/);
      for (let n = Math.min(words.length, 4); n >= 1; n--) {
        const lead = words.slice(0, n).join(' ');
        const abbr = lookupTeamInfo(bet.league, lead)?.abbreviation;
        if (abbr) {
          const rest = words.slice(n).join(' ');
          return rest ? `${abbr} ${rest}` : abbr;
        }
      }
      // No abbreviation (unsupported league such as Soccer): keep the LINE visible
      // by dropping the nickname — "Calgary Stampeders +1.5" -> "Calgary +1.5".
      // The mobile card truncates at 20 chars, which used to eat the spread.
      const m = segment.trim().match(/^(.+?)\s+((?:[-+]\d[\d.]*|(?:over|under).*|ml.*|moneyline.*)\S*.*)$/i);
      if (m) {
        const nameWords = m[1].split(/\s+/);
        const city = nameWords.length > 1 ? nameWords.slice(0, -1).join(' ') : nameWords[0];
        return `${city} ${m[2]}`;
      }
      return segment.trim();
    };
    return bet.bet.split(/\s*&\s*/).map(shorten).join(' & ');
  };

  // ESPN logo first, legacy local file as fallback.
  const logoSrcs = (league: string, teamName: string): string[] => {
    const espn = lookupTeamInfo(league, teamName)?.logo;
    const local = getTeamLogo(teamName);
    return espn ? [espn, local] : [local];
  };

  // Share link for a single bet — same page the Discord post targets, so a
  // text/DM unfurls with the same card.
  const copyBetLink = (betId: string) => {
    const url = `${window.location.origin}/bet/${betId}`;
    fetch(url).catch(() => {});
    navigator.clipboard.writeText(url).then(() => {
      setCopiedBetId(betId);
      setTimeout(() => setCopiedBetId(null), 2500);
    });
  };

  const toggleExpanded = (betId: string) => {
    setExpandedBetId(expandedBetId === betId ? null : betId);
  };

  // Whose bets: me, or anyone I follow. Only shown once I follow someone; it
  // stays on screen while a person's bets load so it doesn't blink.
  const personChip = (active: boolean) =>
    `flex-none inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
    }`;
  const picker = followed.length > 0 && (
    <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Whose bets">
      <button type="button" role="tab" aria-selected={!viewing} className={personChip(!viewing)} onClick={() => setViewing(null)}>
        My bets
      </button>
      {followed.map((p) => (
        <button key={p.id} type="button" role="tab" aria-selected={viewing?.id === p.id} className={personChip(viewing?.id === p.id)} onClick={() => setViewing(p)}>
          {p.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full object-cover" />
          )}
          {p.displayName}
        </button>
      ))}
    </div>
  );

  // NEW: Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        {picker}
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-gray-500">Loading bets...</div>
        </div>
      </div>
    );
  }

  // NEW: Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
        <button 
          onClick={loadBets}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // KEPT: Your entire render logic exactly as it was with updates for teasers
  return (
    <div className="space-y-4">
      {editingBet && (
        <BetEditSheet
          bet={editingBet}
          onClose={() => setEditingBet(null)}
          onSaved={(updated) => setMyBets((list) => list.map((b) => (b.id === updated.id ? updated : b)))}
          onDeleted={(id) => setMyBets((list) => list.filter((b) => b.id !== id))}
        />
      )}
      {picker}
      {viewing && (
        <p className="text-xs text-gray-500">
          Viewing <span className="font-semibold text-gray-700">{viewing.displayName}</span>&apos;s bets (@{viewing.handle}). Read-only.
        </p>
      )}
      {/* View Toggle - Updated label to include Teasers */}
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
            Games/Parlays/Teasers ({gameBets.length})
          </button>
          <button
            onClick={() => {
              setViewType('futures');
              setStatusFilter('pending');
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
        {/* Live vs pregame — only once there is a live bet to split out */}
        {viewType === 'games' && (hasLiveBets || timing !== 'all') && (
          <div className="mt-2 flex justify-center">
            <div className="inline-flex rounded-lg bg-gray-200/80 p-0.5" role="radiogroup" aria-label="Pregame or live bets">
              {([['all', 'All'], ['pregame', 'Pregame'], ['live', 'Live']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={timing === id}
                  onClick={() => setTiming(id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    timing === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compact Stats Bar - KEPT EXACTLY AS IS */}
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

      {/* NEW: League-specific Stats - Only shown for games view */}
      {viewType === 'games' && Object.keys(statsByLeague).length > 0 && (
        <div className="bg-white rounded-lg shadow p-3">
          <div className="space-y-2">
            {Object.entries(statsByLeague).map(([league, leagueStats], index) => {
              const splits = league === 'NCAAF' ? ncaafSplits : null;
              // NCAAF unfurls to divisions (then weeks); NFL unfurls straight to weeks
              const expandable = league === 'NFL' || (!!splits && splits.length > 0);
              const isOpen = expandedLeague === league;
              const nflWeeks = league === 'NFL' && isOpen
                ? weekRows(currentBets.filter((b) => b.league === 'NFL'))
                : null;
              return (
              <div key={league} className={index > 0 ? 'border-t pt-2' : ''}>
              <div
                className={`flex flex-wrap items-center justify-between gap-2 text-xs ${expandable ? 'cursor-pointer select-none' : ''}`}
                role={expandable ? 'button' : undefined}
                title={expandable ? (league === 'NFL' ? 'Tap for week by week' : 'Tap for the FBS / FBS vs FCS split') : undefined}
                onClick={() => {
                  if (!expandable) return;
                  setExpandedLeague(isOpen ? null : league);
                  setExpandedSplit(null);
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-700 min-w-[50px]">{league}{expandable ? (isOpen ? ' ▾' : ' ▸') : ''}</span>
                  <span className="font-medium">
                    {leagueStats.wonBets}-{leagueStats.lostBets}-{leagueStats.pushBets}
                  </span>
                  <span className="text-gray-500">
                    {leagueStats.winRate.toFixed(0)}% Win
                  </span>
                  <span className={`font-medium ${leagueStats.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {leagueStats.profit >= 0 ? '+' : ''}{leagueStats.profit.toFixed(2)}u
                  </span>
                </div>
                <span className="text-gray-400">
                  {leagueStats.pendingBets} pending
                </span>
              </div>
              {/* NFL: week rows directly under the league */}
              {nflWeeks && (
                <div className="mt-1.5 ml-3 pl-3 border-l-2 border-gray-100 space-y-1">
                  {nflWeeks.map(({ label, stats: s }) => (
                    <SubStatRow key={label} label={label} stats={s} week />
                  ))}
                </div>
              )}
              {/* NCAAF: division split rows, each unfurling to its weeks */}
              {splits && isOpen && (
                <div className="mt-1.5 ml-3 pl-3 border-l-2 border-gray-100 space-y-1">
                  {splits.map(({ label, stats: s, bets: splitBets }) => {
                    const splitOpen = expandedSplit === label;
                    return (
                      <div key={label}>
                        <SubStatRow
                          label={`${label}${splitOpen ? ' ▾' : ' ▸'}`}
                          stats={s}
                          onClick={() => setExpandedSplit(splitOpen ? null : label)}
                          title="Tap for week by week"
                        />
                        {splitOpen && (
                          <div className="mt-1 ml-3 pl-3 border-l-2 border-gray-100 space-y-1">
                            {weekRows(splitBets).map(({ label: wk, stats: ws }) => (
                              <SubStatRow key={wk} label={wk} stats={ws} week />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status Filter Tabs - KEPT EXACTLY AS IS */}
      <div className="bg-white rounded-lg shadow p-2">
        <div className="flex gap-1 justify-center flex-wrap">
          {(['all', 'pending', 'settled', 'won', 'lost', 'push'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === status
                  ? status === 'all' ? 'bg-gray-700 text-white'
                    : status === 'won' ? 'bg-green-600 text-white'
                    : status === 'lost' ? 'bg-red-600 text-white'
                    : status === 'push' ? 'bg-gray-500 text-white'
                    : status === 'settled' ? 'bg-indigo-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="capitalize">{status}</span>
              <span className="ml-1 opacity-75">
                ({status === 'all'
                  ? currentBets.length
                  : status === 'settled'
                    ? currentBets.filter(b => b.status !== 'pending').length
                    : currentBets.filter(b => b.status === status).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Bets List - UPDATED for teasers */}
      <div className="space-y-2">
        {displayedBets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            {statusFilter === 'all' 
              ? `No ${viewType === 'games' ? 'game bets, parlays, or teasers' : 'futures'} placed yet.`
              : `No ${statusFilter} ${viewType === 'games' ? 'game bets, parlays, or teasers' : 'futures'}.`}
          </div>
        ) : (
          displayedBets.map(bet => {
            const isExpanded = expandedBetId === bet.id;
            // Calculate actual profit/loss based on status
            let profit = 0;
            if (bet.status === 'won') {
              profit = calculateProfit(bet.stake, bet.odds);
            } else if (bet.status === 'lost') {
              profit = -bet.stake;
            }
            // status === 'push' or 'pending' remains 0
            
            const teams = parseTeams(bet);
            const futureTeam = bet.betType === 'future' ? bet.team : null;
            const isTeaser = bet.betType === 'teaser';
            const isParlay = bet.betType === 'parlay';

            // Team-color accent (same treatment as Bet Admin cards); falls back
            // to the status-colored edge when no team color is available.
            const primaryTeam = getPrimaryTeamInfo(bet);
            const accent = primaryTeam?.color ? `#${primaryTeam.color}` : null;
            const cardStyle = accent
              ? {
                  borderLeftColor: accent,
                  backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 0.07)} 0%, rgba(255,255,255,0) 45%)`,
                }
              : undefined;

            return (
              <div key={bet.id}>
                <div className={`bg-white rounded-lg shadow border-l-4 transition-all duration-200 ${
                  accent ? '' : getStatusColor(bet.status).split(' ')[2]
                } ${
                  bet.status === 'pending' && /^(Soon|\d+m)$/.test(formatTimeRemaining(bet.eventDate, kickoffs[bet.id]) ?? '')
                    ? 'ring-2 ring-blue-400' : ''
                }`}
                style={cardStyle}>
                  {/* Main Bet Row - Mobile Optimized - UPDATED FOR TEASERS */}
                  <div 
                    className="p-3 cursor-pointer"
                    onClick={() => toggleExpanded(bet.id)}
                  >
                    <div className="flex items-center gap-2">
                      {/* Status Icon */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getStatusColor(bet.status)}`}>
                        {getStatusIcon(bet.status, bet.sport, bet.league)}
                      </div>

                      {/* Event Date - Shows prominently - Hidden on mobile for futures */}
                      <div className={`flex flex-col items-start min-w-[48px] sm:min-w-[52px] ${
                        viewType === 'futures' ? 'hidden sm:flex' : ''
                      }`}>
                        <span className="text-xs font-medium text-gray-700">
                          {formatDate(bet.eventDate)}
                        </span>
                        {bet.status === 'pending' && formatTimeRemaining(bet.eventDate, kickoffs[bet.id]) && (
                          <span className="text-xs text-blue-500 font-medium">
                            {formatTimeRemaining(bet.eventDate, kickoffs[bet.id])}
                          </span>
                        )}
                      </div>

                      {/* Sport/League Badge - Hidden on mobile for both views */}
                      <span className="hidden sm:inline-flex text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">
                        {bet.league}
                      </span>

                      {/* Teams/Description with Logos - Mobile optimized with teaser and parlay support */}
                      <div className={`flex items-center gap-1 min-w-0 ${
                        viewType === 'games' ? 'flex-1' : ''
                      }`}>
                        {/* PARLAY: Show all team logos from parlayTeams array */}
                        {viewType === 'games' && isParlay && bet.parlayTeams && bet.parlayTeams.length > 0 ? (
                          <>
                            {/* Mobile: Show all logos with & separators */}
                            <div className="flex sm:hidden items-center gap-1 flex-wrap">
                              {bet.parlayTeams.map((team, index) => (
                                <span key={index} className="flex items-center gap-1">
                                  <TeamLogoImg srcs={logoSrcs(bet.league, team)} className="h-5 w-5 object-contain" />
                                  {index < bet.parlayTeams!.length - 1 && (
                                    <span className="text-xs text-gray-400">&</span>
                                  )}
                                </span>
                              ))}
                            </div>

                            {/* Desktop: Show all logos with team names separated by & */}
                            <div className="hidden sm:flex items-center gap-1 flex-wrap">
                              {bet.parlayTeams.map((team, index) => (
                                <span key={index} className="flex items-center gap-1">
                                  <TeamLogoImg srcs={logoSrcs(bet.league, team)} className="h-4 w-4 object-contain" />
                                  <span className="text-sm truncate">{team}</span>
                                  {index < bet.parlayTeams!.length - 1 && (
                                    <span className="text-xs text-gray-400">&</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </>
                        ) : viewType === 'games' && isParlay && teams ? (
                          <>
                            {/* Fallback for parlays without parlayTeams array (legacy data) */}
                            {/* Mobile: Show logos with & separator */}
                            <div className="flex sm:hidden items-center gap-1">
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.away)} className="h-5 w-5 object-contain" />
                              <span className="text-xs text-gray-400">&</span>
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.home)} className="h-5 w-5 object-contain" />
                            </div>

                            {/* Desktop: Show logos with team names separated by & */}
                            <div className="hidden sm:flex items-center gap-1">
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.away)} className="h-4 w-4 object-contain" />
                              <span className="text-sm truncate">{teams.away}</span>
                              <span className="text-xs text-gray-400">&</span>
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.home)} className="h-4 w-4 object-contain" />
                              <span className="text-sm truncate">{teams.home}</span>
                            </div>
                          </>
                        ) : viewType === 'games' && teams ? (
                          <>
                            {/* Mobile: Show logos only or with abbreviated names */}
                            <div className="flex sm:hidden items-center gap-1">
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.away)} className="h-5 w-5 object-contain" />
                              <span className="text-xs text-gray-400">
                                {isTeaser ? '&' : '@'}
                              </span>
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.home)} className="h-5 w-5 object-contain" />
                            </div>

                            {/* Desktop: Show full team names with logos */}
                            <div className="hidden sm:flex items-center gap-1">
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.away)} className="h-4 w-4 object-contain" />
                              <span className="text-sm truncate">{teams.away}</span>
                              <span className="text-xs text-gray-400">
                                {isTeaser ? '&' : '@'}
                              </span>
                              <TeamLogoImg srcs={logoSrcs(bet.league, teams.home)} className="h-4 w-4 object-contain" />
                              <span className="text-sm truncate">{teams.home}</span>
                            </div>
                          </>
                        ) : futureTeam ? (
                          <>
                            {/* Mobile: Show logo only for futures */}
                            <div className="flex sm:hidden items-center gap-2">
                              <TeamLogoImg srcs={logoSrcs(bet.league, futureTeam)} className="h-6 w-6 flex-shrink-0 object-contain" />
                            </div>

                            {/* Desktop: Show logo and full description for futures */}
                            <div className="hidden sm:flex items-center gap-1">
                              <TeamLogoImg srcs={logoSrcs(bet.league, futureTeam)} className="h-4 w-4 object-contain" />
                              <span className="text-sm truncate">{bet.description}</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-sm truncate">{bet.description}</span>
                        )}
                      </div>

                      {/* Bet Type - Hidden on mobile for both views, visible on desktop */}
                      <span className="hidden sm:inline-flex text-xs px-1.5 py-0.5 bg-blue-100 rounded text-blue-700 font-medium">
                        {getBetTypeLabel(bet.betType)}
                      </span>

                      {/* The Bet/Description - Different fields for mobile futures */}
                      <span className={`text-xs font-medium ${
                        viewType === 'futures' 
                          ? 'flex-1 text-left sm:text-right' 
                          : 'min-w-[60px] sm:min-w-[80px] text-right'
                      }`}>
                        {bet.live && <LiveTag className="mr-1 align-middle" />}
                        {/* MOBILE: Show DESCRIPTION for futures, abbreviated BET for
                            games — team names shortened to ESPN abbreviations so the
                            spread stays visible ("TEX -3.5" instead of "Texas Long...") */}
                        <span className="sm:hidden">
                          {viewType === 'games'
                            ? (() => {
                                const short = abbreviateBetText(bet);
                                return short.length > 20 ? short.substring(0, 20) + '...' : short;
                              })()
                            : bet.description}
                        </span>
                        {/* DESKTOP: abbreviated BET for games (full names already shown
                            at left), full BET for futures */}
                        <span className="hidden sm:inline">
                          {viewType === 'games'
                            ? abbreviateBetText(bet)
                            : bet.bet.length > 25
                              ? bet.bet.substring(0, 25) + '...'
                              : bet.bet}
                        </span>
                      </span>

                      {/* Odds - Hidden on mobile for both views */}
                      <span className="hidden sm:inline text-xs text-gray-500 min-w-[40px] text-right">
                        {formatOdds(bet.odds)}
                      </span>

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
                        <span className={`text-xs font-medium text-right ${
                          viewType === 'futures' ? 'hidden sm:inline min-w-[40px] sm:min-w-[45px]' : 'min-w-[40px] sm:min-w-[45px]'
                        } ${
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

                  {/* Expanded Details - UPDATED FOR TEASERS AND PARLAYS */}
                  {isExpanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                      <div className="mt-2 space-y-1 text-xs">
                        {/* Show full bet description for parlays and teasers */}
                        {(bet.betType === 'parlay' || bet.betType === 'teaser') && (
                          <div className="mb-2 p-2 bg-blue-50 rounded">
                            <span className="font-medium text-blue-800">
                              Full {bet.betType === 'teaser' ? 'Teaser' : 'Parlay'}:
                            </span>
                            <span className="block mt-1 text-blue-700">{bet.bet}</span>
                          </div>
                        )}
                        
                        {/* Show all parlay teams on mobile when expanded */}
                        {viewType === 'games' && isParlay && bet.parlayTeams && bet.parlayTeams.length > 0 && (
                          <div className="sm:hidden mb-2 p-2 bg-gray-50 rounded">
                            <span className="font-medium text-gray-800">Parlay Teams:</span>
                            <span className="block mt-1 text-gray-700">
                              {bet.parlayTeams.join(' & ')}
                            </span>
                            <div className="mt-2 flex justify-between text-xs">
                              <span className="text-gray-500">League:</span>
                              <span>{bet.league}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Show full team names on mobile when expanded (non-parlay or legacy parlay) */}
                        {viewType === 'games' && teams && !(isParlay && bet.parlayTeams && bet.parlayTeams.length > 0) && (
                          <div className="sm:hidden mb-2 p-2 bg-gray-50 rounded">
                            <span className="font-medium text-gray-800">
                              {isParlay ? 'Parlay' : isTeaser ? 'Teaser' : 'Game'}:
                            </span>
                            <span className="block mt-1 text-gray-700">
                              {teams.away} {isParlay ? '&' : isTeaser ? '&' : '@'} {teams.home}
                            </span>
                            <div className="mt-2 flex justify-between text-xs">
                              <span className="text-gray-500">League:</span>
                              <span>{bet.league}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Show full future description on mobile when expanded */}
                        {viewType === 'futures' && (
                          <div className="sm:hidden mb-2 p-2 bg-gray-50 rounded">
                            <span className="font-medium text-gray-800">Full bet:</span>
                            <span className="block mt-1 text-gray-700">
                              {bet.bet}
                            </span>
                            <div className="mt-2 flex justify-between text-xs">
                              <span className="text-gray-500">League:</span>
                              <span>{bet.league}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Show bet type on mobile when expanded */}
                        <div className="sm:hidden flex justify-between mb-1">
                          <span className="text-gray-500">Bet type:</span>
                          <span className="px-1.5 py-0.5 bg-blue-100 rounded text-blue-700 font-medium text-xs">
                            {getBetTypeLabel(bet.betType)}
                          </span>
                        </div>
                        
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
                        {!viewing && (
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-gray-500">Edit:</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingBet(bet); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                            Edit / grade
                          </button>
                        </div>
                        )}
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-gray-500">Share:</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyBetLink(bet.id); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          >
                            {copiedBetId === bet.id ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" /></svg>
                                Copied
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                Copy link
                              </>
                            )}
                          </button>
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