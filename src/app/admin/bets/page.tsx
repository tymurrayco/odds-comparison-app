// src/app/admin/bets/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { fetchBets, createBet, updateBet, deleteBet, Bet, BetStatus, BetType } from '@/lib/betService';

interface BetTeamInfo {
  displayName: string;
  logo: string;
  color: string;
  alternateColor?: string;
}

// Keep in sync with src/app/api/bet-team-logos/route.ts (duplicated to avoid
// importing server code from a client component).
const normalizeTeamKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Leagues with ESPN team data (excluded: UFC, PGA, Tennis, MMA, Golf, Soccer).
const SUPPORTED_LEAGUES = new Set(['NFL', 'NCAAF', 'NBA', 'NCAAB', 'MLB', 'NHL']);

const hexToRgba = (hex: string, alpha: number): string => {
  const h = hex.replace('#', '').trim();
  if (h.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Inline SVG icons — avoids a lucide-react dependency for this single page.
const iconProps = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const IconPlus = () => <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>;
const IconList = () => <svg {...iconProps}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
const IconEdit = () => <svg {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>;
const IconTrash = () => <svg {...iconProps}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;
const IconSend = () => <svg {...iconProps}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>;
const IconCheck = () => <svg {...iconProps}><path d="M20 6L9 17l-5-5" /></svg>;
const IconArrowLeft = () => <svg {...iconProps}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>;
const IconClose = () => <svg {...iconProps} width={14} height={14}><path d="M18 6L6 18M6 6l12 12" /></svg>;
const IconSpinner = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="animate-spin">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

// Shared input/select/textarea classes — consistent focus ring + border radius.
const fieldCls = 'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';
const labelCls = 'block text-xs font-medium text-slate-600 mb-1.5';

// Inline status dropdown: colored dot + label wrapping a transparent native <select>.
function StatusSelect({ bet, onChange }: { bet: Bet; onChange: (s: BetStatus) => void }) {
  const config = {
    pending: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-800' },
    won: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-800' },
    lost: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-800' },
    push: { dot: 'bg-slate-400', bg: 'bg-slate-100', text: 'text-slate-700' },
  }[bet.status];
  return (
    <div className={`relative inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span className="capitalize">{bet.status}</span>
      <select
        value={bet.status}
        onChange={(e) => onChange(e.target.value as BetStatus)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="Update status"
      >
        <option value="pending">Pending</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
        <option value="push">Push</option>
      </select>
    </div>
  );
}

export default function BetAdminPage() {
  const router = useRouter();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [view, setView] = useState<'form' | 'list'>('list');
  const [sendingBetId, setSendingBetId] = useState<string | null>(null);
  const [sentBets, setSentBets] = useState<Set<string>>(new Set());
  const [isDesktop, setIsDesktop] = useState(false);

  const [parlayTeams, setParlayTeams] = useState<string[]>(['', '']);
  const [teamMaps, setTeamMaps] = useState<Record<string, Record<string, BetTeamInfo>>>({});

  useEffect(() => {
    const checkScreenSize = () => setIsDesktop(window.innerWidth >= 640);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const formatDateForInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isWithin24Hours = (eventDate: string): boolean => {
    const event = new Date(eventDate + 'T00:00:00');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayAfterTomorrow = new Date(todayStart);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const eventTime = event.getTime();
    return eventTime >= todayStart.getTime() && eventTime < dayAfterTomorrow.getTime();
  };

  const getInitialFormState = () => ({
    date: formatDateForInput(new Date()),
    eventDate: formatDateForInput(new Date()),
    sport: 'Football',
    league: 'NCAAF',
    description: '',
    awayTeam: '',
    homeTeam: '',
    team: '',
    betType: 'spread' as BetType,
    bet: '',
    odds: -110,
    stake: 1,
    status: 'pending' as BetStatus,
    result: '',
    book: 'FanDuel',
    notes: ''
  });

  const [formData, setFormData] = useState(getInitialFormState());
  const [oddsInput, setOddsInput] = useState('-110');

  useEffect(() => {
    loadBets();
  }, []);

  // Lazy-load team logo/color maps for each supported league present in the bet list.
  useEffect(() => {
    const needed = Array.from(new Set(bets.map(b => b.league)))
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
  }, [bets, teamMaps]);

  // Resolve a bet's primary team: prefer `team` (futures), then homeTeam, then awayTeam,
  // then try the leading word(s) of `bet.bet` (e.g., "Chiefs -3.5" → "Chiefs").
  const getTeamInfo = (bet: Bet): BetTeamInfo | null => {
    const map = teamMaps[bet.league];
    if (!map) return null;

    const candidates: string[] = [];
    if (bet.team) candidates.push(bet.team);
    if (bet.homeTeam) candidates.push(bet.homeTeam);
    if (bet.awayTeam) candidates.push(bet.awayTeam);
    // Parse leading tokens from bet text — stop at number, comma, or spread/ml indicator.
    const betLead = bet.bet?.match(/^([A-Za-z .'-]+?)(?:\s+[-+0-9]|,|$)/)?.[1]?.trim();
    if (betLead) candidates.push(betLead);

    for (const c of candidates) {
      const key = normalizeTeamKey(c);
      if (map[key]) return map[key];
    }
    return null;
  };

  const loadBets = async () => {
    try {
      const fetchedBets = await fetchBets();
      setBets(fetchedBets);
    } catch (error) {
      console.error('Error loading bets:', error);
    }
  };

  useEffect(() => {
    if (formData.betType === 'parlay') {
      const filledTeams = parlayTeams.filter(t => t.trim() !== '');
      if (filledTeams.length > 0) {
        setFormData(prev => ({ ...prev, description: filledTeams.join(' & ') }));
      }
    }
  }, [parlayTeams, formData.betType]);

  useEffect(() => {
    if (formData.betType !== 'parlay') {
      setParlayTeams(['', '']);
    }
  }, [formData.betType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const filledParlayTeams = parlayTeams.filter(t => t.trim() !== '');

      const betData = {
        ...formData,
        awayTeam: formData.betType === 'parlay' ? undefined : (formData.awayTeam || undefined),
        homeTeam: formData.betType === 'parlay' ? undefined : (formData.homeTeam || undefined),
        team: formData.team || undefined,
        result: formData.result || undefined,
        notes: formData.notes || undefined,
        parlayTeams: formData.betType === 'parlay' && filledParlayTeams.length > 0 ? filledParlayTeams : undefined
      };

      if (editingBet) {
        await updateBet(editingBet.id, betData);
      } else {
        await createBet(betData);
      }

      setFormData(getInitialFormState());
      setOddsInput('-110');
      setParlayTeams(['', '']);
      setEditingBet(null);

      await loadBets();
      setView('list');
      setShowForm(false);
    } catch (error) {
      console.error('Error saving bet:', error);
      alert('Error saving bet. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (bet: Bet) => {
    setFormData({
      date: bet.date,
      eventDate: bet.eventDate,
      sport: bet.sport,
      league: bet.league,
      description: bet.description,
      awayTeam: bet.awayTeam || '',
      homeTeam: bet.homeTeam || '',
      team: bet.team || '',
      betType: bet.betType,
      bet: bet.bet,
      odds: bet.odds,
      stake: bet.stake,
      status: bet.status,
      result: bet.result || '',
      book: bet.book || 'FanDuel',
      notes: bet.notes || ''
    });
    setOddsInput(String(bet.odds));

    if (bet.betType === 'parlay' && bet.parlayTeams && bet.parlayTeams.length > 0) {
      setParlayTeams(bet.parlayTeams);
    } else if (bet.betType === 'parlay') {
      const teams = bet.description.split('&').map(t => t.trim()).filter(t => t);
      setParlayTeams(teams.length >= 2 ? teams : ['', '']);
    } else {
      setParlayTeams(['', '']);
    }

    setEditingBet(bet);
    setView('form');
    setShowForm(true);
    window.scrollTo(0, 0);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this bet?')) {
      try {
        await deleteBet(id);
        await loadBets();
      } catch (error) {
        console.error('Error deleting bet:', error);
      }
    }
  };

  const handleQuickStatusUpdate = async (bet: Bet, newStatus: BetStatus) => {
    try {
      await updateBet(bet.id, { status: newStatus });
      await loadBets();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleSendToZapier = async (bet: Bet) => {
    setSendingBetId(bet.id);

    try {
      const response = await fetch('/api/send-to-zapier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bet)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send');
      }

      setSentBets(prev => new Set([...prev, bet.id]));

      setTimeout(() => {
        setSentBets(prev => {
          const newSet = new Set(prev);
          newSet.delete(bet.id);
          return newSet;
        });
      }, 3000);

    } catch (error) {
      console.error('Error sending to Zapier:', error);
      alert(`Failed to send bet to Zapier. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSendingBetId(null);
    }
  };

  const parseAndFillTeams = () => {
    const patterns = [
      /(.+?)\s*@\s*(.+)/,
      /(.+?)\s*vs\.?\s*(.+)/i,
      /(.+?)\s*&\s*(.+)/i,
    ];

    for (const pattern of patterns) {
      const match = formData.description.match(pattern);
      if (match) {
        setFormData({ ...formData, awayTeam: match[1].trim(), homeTeam: match[2].trim() });
        break;
      }
    }
  };

  const handleParlayTeamChange = (index: number, value: string) => {
    const newTeams = [...parlayTeams];
    newTeams[index] = value;
    setParlayTeams(newTeams);
  };

  const addParlayTeam = () => setParlayTeams([...parlayTeams, '']);

  const removeParlayTeam = (index: number) => {
    if (parlayTeams.length > 2) {
      setParlayTeams(parlayTeams.filter((_, i) => i !== index));
    }
  };

  const filteredBets = bets.filter(bet => {
    if (filter === 'pending') return bet.status === 'pending';
    if (filter === 'completed') return bet.status !== 'pending';
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.eventDate + 'T00:00:00').getTime();
    const dateB = new Date(b.eventDate + 'T00:00:00').getTime();
    if (a.status === 'pending' && b.status === 'pending') return dateA - dateB;
    if (a.status !== 'pending' && b.status !== 'pending') return dateB - dateA;
    return a.status === 'pending' ? -1 : 1;
  });

  // Derived stats for the strip above the filter tabs.
  const stats = useMemo(() => {
    const pending = bets.filter(b => b.status === 'pending');
    const pendingUnits = pending.reduce((sum, b) => sum + b.stake, 0);
    const decided = bets.filter(b => b.status === 'won' || b.status === 'lost');
    const wins = decided.filter(b => b.status === 'won').length;
    const winRate = decided.length > 0 ? (wins / decided.length) * 100 : null;
    return {
      pendingCount: pending.length,
      pendingUnits,
      winRate,
      decidedCount: decided.length,
    };
  }, [bets]);

  const filterTabs: { key: 'all' | 'pending' | 'completed'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: bets.length },
    { key: 'pending', label: 'Pending', count: bets.filter(b => b.status === 'pending').length },
    { key: 'completed', label: 'Done', count: bets.filter(b => b.status !== 'pending').length },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Bet Admin</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Track and manage your wagers</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              <IconArrowLeft />
              Back
            </button>
          </div>

          {/* Mobile view toggle */}
          <div className="flex gap-2 mt-4 sm:hidden">
            <button
              onClick={() => { setView('form'); setShowForm(true); }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                view === 'form'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <IconPlus />
              New Bet
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                view === 'list'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <IconList />
              List ({bets.length})
            </button>
          </div>

          {/* Desktop form toggle */}
          <div className="hidden sm:flex gap-2 mt-4">
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
            >
              <IconPlus />
              {showForm ? 'Hide Form' : 'New Bet'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Pending" value={String(stats.pendingCount)} />
          <StatCard label="Pending Units" value={`${stats.pendingUnits % 1 === 0 ? stats.pendingUnits : stats.pendingUnits.toFixed(1)}u`} />
          <StatCard
            label="Win Rate"
            value={stats.winRate === null ? '—' : `${stats.winRate.toFixed(0)}%`}
            sublabel={stats.winRate === null ? 'No graded bets' : `${stats.decidedCount} graded`}
          />
        </div>

        {/* Form */}
        {(view === 'form' || (showForm && isDesktop)) && (
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">
                {editingBet ? 'Edit Bet' : 'New Bet'}
              </h2>
              {editingBet && (
                <span className="text-xs text-slate-500">Editing #{editingBet.id.slice(0, 8)}</span>
              )}
            </div>

            {/* Quick fill chips */}
            <div className="mb-5 flex flex-wrap gap-2">
              <span className="text-xs font-medium text-slate-500 self-center mr-1">Quick fill:</span>
              <button
                type="button"
                onClick={parseAndFillTeams}
                disabled={formData.betType === 'future' || formData.betType === 'parlay'}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Parse Teams
              </button>
              <button
                type="button"
                onClick={() => { setFormData({ ...formData, odds: -110 }); setOddsInput('-110'); }}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium hover:bg-slate-200 transition"
              >
                -110
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, stake: 1 })}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium hover:bg-slate-200 transition"
              >
                1u
              </button>
              <button
                type="button"
                onClick={() => {
                  const tomorrow = new Date();
                  tomorrow.setDate(tomorrow.getDate() + 1);
                  setFormData({ ...formData, eventDate: formatDateForInput(tomorrow) });
                }}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium hover:bg-slate-200 transition"
              >
                Tomorrow
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Sport</label>
                  <select
                    value={formData.sport}
                    onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
                    className={fieldCls}
                  >
                    <option value="Football">Football</option>
                    <option value="Basketball">Basketball</option>
                    <option value="Baseball">Baseball</option>
                    <option value="Hockey">Hockey</option>
                    <option value="Soccer">Soccer</option>
                    <option value="Golf">Golf</option>
                    <option value="Tennis">Tennis</option>
                    <option value="MMA">MMA</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>League</label>
                  <select
                    value={formData.league}
                    onChange={(e) => setFormData({ ...formData, league: e.target.value })}
                    className={fieldCls}
                  >
                    <option value="NFL">NFL</option>
                    <option value="NCAAF">NCAAF</option>
                    <option value="NBA">NBA</option>
                    <option value="NCAAB">NCAAB</option>
                    <option value="MLB">MLB</option>
                    <option value="NHL">NHL</option>
                    <option value="UFC">UFC</option>
                    <option value="PGA">PGA</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Event Date</label>
                  <input
                    type="date"
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className={fieldCls}
                    required
                  />
                </div>

                <div>
                  <label className={labelCls}>Bet Type</label>
                  <select
                    value={formData.betType}
                    onChange={(e) => setFormData({ ...formData, betType: e.target.value as BetType })}
                    className={fieldCls}
                  >
                    <option value="spread">Spread</option>
                    <option value="moneyline">Moneyline</option>
                    <option value="total">Total</option>
                    <option value="prop">Prop</option>
                    <option value="parlay">Parlay</option>
                    <option value="teaser">Teaser</option>
                    <option value="future">Future</option>
                  </select>
                </div>
              </div>

              {formData.betType !== 'parlay' && (
                <div>
                  <label className={labelCls}>
                    Description {formData.betType === 'future' ? '' : formData.betType === 'teaser' ? '(Team & Team)' : '(Away @ Home)'}
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={formData.betType === 'future' ? 'Championship/Award' : formData.betType === 'teaser' ? 'Team & Team' : 'Away @ Home'}
                    className={fieldCls}
                    required
                  />
                </div>
              )}

              {formData.betType === 'parlay' && (
                <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-semibold text-indigo-900 uppercase tracking-wide">Parlay Teams</label>
                    <button
                      type="button"
                      onClick={addParlayTeam}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition"
                    >
                      <IconPlus />
                      Team
                    </button>
                  </div>
                  <div className="space-y-2">
                    {parlayTeams.map((team, index) => (
                      <div key={index} className="flex gap-2">
                        <input
                          type="text"
                          value={team}
                          onChange={(e) => handleParlayTeamChange(index, e.target.value)}
                          placeholder={`Team ${index + 1}`}
                          className={fieldCls}
                        />
                        {parlayTeams.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeParlayTeam(index)}
                            className="inline-flex items-center justify-center w-9 h-9 text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition"
                            aria-label={`Remove team ${index + 1}`}
                          >
                            <IconClose />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {parlayTeams.filter(t => t.trim()).length > 0 && (
                    <div className="mt-3 text-xs text-indigo-700">
                      <span className="font-medium">Preview:</span> {parlayTeams.filter(t => t.trim()).join(' & ')}
                    </div>
                  )}
                </div>
              )}

              {formData.betType === 'future' ? (
                <div>
                  <label className={labelCls}>Team / Player</label>
                  <input
                    type="text"
                    value={formData.team}
                    onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                    placeholder="e.g., Alabama Crimson Tide"
                    className={fieldCls}
                  />
                </div>
              ) : formData.betType !== 'parlay' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>
                      {formData.betType === 'teaser' ? 'First Team' : 'Away Team'}
                    </label>
                    <input
                      type="text"
                      value={formData.awayTeam}
                      onChange={(e) => setFormData({ ...formData, awayTeam: e.target.value })}
                      placeholder="Optional"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      {formData.betType === 'teaser' ? 'Second Team' : 'Home Team'}
                    </label>
                    <input
                      type="text"
                      value={formData.homeTeam}
                      onChange={(e) => setFormData({ ...formData, homeTeam: e.target.value })}
                      placeholder="Optional"
                      className={fieldCls}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className={labelCls}>Bet</label>
                <input
                  type="text"
                  value={formData.bet}
                  onChange={(e) => setFormData({ ...formData, bet: e.target.value })}
                  placeholder={
                    formData.betType === 'spread' ? 'Team -3.5' :
                    formData.betType === 'total' ? 'Over 52.5' :
                    formData.betType === 'teaser' ? 'Team1 +7, Team2 -3' :
                    formData.betType === 'parlay' ? 'Team1 -3, Team2 ML, Team3 +7' :
                    formData.betType === 'future' ? 'To win Championship' :
                    'Bet description'
                  }
                  className={fieldCls}
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Odds</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={oddsInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || val === '-' || /^-?\d+$/.test(val)) {
                        setOddsInput(val);
                        const parsed = parseInt(val);
                        if (!isNaN(parsed)) {
                          setFormData({ ...formData, odds: parsed });
                        }
                      }
                    }}
                    onBlur={() => {
                      const parsed = parseInt(oddsInput);
                      if (isNaN(parsed) || oddsInput === '' || oddsInput === '-') {
                        setOddsInput('-110');
                        setFormData({ ...formData, odds: -110 });
                      }
                    }}
                    className={fieldCls}
                    required
                  />
                </div>

                <div>
                  <label className={labelCls}>Units</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.stake}
                    onChange={(e) => setFormData({ ...formData, stake: parseFloat(e.target.value) || 0 })}
                    className={fieldCls}
                    required
                  />
                </div>

                <div>
                  <label className={labelCls}>Book</label>
                  <select
                    value={formData.book}
                    onChange={(e) => setFormData({ ...formData, book: e.target.value })}
                    className={fieldCls}
                  >
                    <option value="FanDuel">FD</option>
                    <option value="DraftKings">DK</option>
                    <option value="BetMGM">MGM</option>
                    <option value="BetRivers">BR</option>
                    <option value="Caesars">CZR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Reasoning..."
                  className={fieldCls}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
              >
                {loading && <IconSpinner />}
                {loading ? 'Saving...' : editingBet ? 'Update Bet' : 'Add Bet'}
              </button>

              {editingBet && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBet(null);
                    setFormData(getInitialFormState());
                    setOddsInput('-110');
                    setParlayTeams(['', '']);
                  }}
                  className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {/* List */}
        {(view === 'list' || isDesktop) && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            {/* Segmented filter control */}
            <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-slate-100">
              <div className="inline-flex items-center bg-slate-100 rounded-lg p-1">
                {filterTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                      filter === tab.key
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label} <span className={filter === tab.key ? 'text-slate-400' : 'text-slate-400'}>({tab.count})</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden p-4 space-y-3">
              {filteredBets.map((bet) => {
                const teamInfo = getTeamInfo(bet);
                const accent = teamInfo?.color ? `#${teamInfo.color}` : null;
                const cardStyle = accent
                  ? {
                      borderLeftColor: accent,
                      backgroundImage: `linear-gradient(135deg, ${hexToRgba(accent, 0.07)} 0%, rgba(255,255,255,0) 45%)`,
                    }
                  : undefined;
                return (
                <div
                  key={bet.id}
                  className={`relative border rounded-xl p-4 bg-white hover:border-slate-300 transition ${accent ? 'border-l-[3px] border-slate-200' : 'border-slate-200'}`}
                  style={cardStyle}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {teamInfo?.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={teamInfo.logo}
                          alt=""
                          className="w-9 h-9 object-contain flex-shrink-0 mt-0.5"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate">{bet.description}</div>
                        {bet.team && (
                          <div className="text-xs font-medium text-slate-700 mt-0.5">{bet.team}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          {isWithin24Hours(bet.eventDate) && bet.status === 'pending' && (
                            <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" title="Within 24 hours" />
                          )}
                          <span>
                            {new Date(bet.eventDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>{bet.league}</span>
                        </div>
                      </div>
                    </div>
                    <StatusSelect bet={bet} onChange={(s) => handleQuickStatusUpdate(bet, s)} />
                  </div>

                  <div className="text-sm font-semibold text-indigo-600 mb-3">
                    {bet.bet}
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <div className="flex gap-3 text-slate-600 tabular-nums">
                      <span className="font-medium">{bet.odds > 0 ? '+' : ''}{bet.odds}</span>
                      <span>{bet.stake}u</span>
                      <span className="text-slate-400">{bet.book}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSendToZapier(bet)}
                        disabled={sendingBetId === bet.id}
                        className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg disabled:opacity-50 transition"
                        title="Send to Zapier"
                      >
                        {sendingBetId === bet.id ? <IconSpinner /> : sentBets.has(bet.id) ? <span className="text-emerald-600"><IconCheck /></span> : <IconSend />}
                      </button>
                      <button
                        onClick={() => handleEdit(bet)}
                        className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-lg transition"
                        title="Edit"
                      >
                        <IconEdit />
                      </button>
                      <button
                        onClick={() => handleDelete(bet.id)}
                        className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-rose-600 hover:bg-slate-50 rounded-lg transition"
                        title="Delete"
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>

                  {bet.notes && (
                    <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                      {bet.notes}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Bet</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Odds</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Units</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Book</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBets.map((bet) => {
                    const teamInfo = getTeamInfo(bet);
                    const accent = teamInfo?.color ? `#${teamInfo.color}` : null;
                    return (
                    <tr
                      key={bet.id}
                      className="border-b border-slate-100 hover:bg-slate-50/60 transition"
                      style={accent ? {
                        boxShadow: `inset 3px 0 0 0 ${accent}`,
                        backgroundImage: `linear-gradient(90deg, ${hexToRgba(accent, 0.05)} 0%, rgba(255,255,255,0) 30%)`,
                      } : undefined}
                    >
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {isWithin24Hours(bet.eventDate) && bet.status === 'pending' && (
                            <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" title="Within 24 hours" />
                          )}
                          <span className="text-slate-700">
                            {new Date(bet.eventDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-0">
                        <div className="flex items-center gap-3">
                          {teamInfo?.logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={teamInfo.logo}
                              alt=""
                              className="w-7 h-7 object-contain flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900">{bet.description}</div>
                            {bet.team && (
                              <div className="text-xs font-medium text-slate-700">{bet.team}</div>
                            )}
                            <div className="text-xs text-slate-400">{bet.league}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-indigo-600">{bet.bet}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{bet.odds > 0 ? '+' : ''}{bet.odds}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{bet.stake}</td>
                      <td className="px-4 py-3">
                        <StatusSelect bet={bet} onChange={(s) => handleQuickStatusUpdate(bet, s)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{bet.book}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleSendToZapier(bet)}
                            disabled={sendingBetId === bet.id}
                            className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition"
                            title="Send to Zapier"
                          >
                            {sendingBetId === bet.id ? <IconSpinner /> : sentBets.has(bet.id) ? <span className="text-emerald-600"><IconCheck /></span> : <IconSend />}
                          </button>
                          <button
                            onClick={() => handleEdit(bet)}
                            className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                            title="Edit"
                          >
                            <IconEdit />
                          </button>
                          <button
                            onClick={() => handleDelete(bet.id)}
                            className="inline-flex items-center justify-center w-8 h-8 text-slate-500 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredBets.length === 0 && (
              <div className="px-6 py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-3 text-slate-400">
                  <IconList />
                </div>
                <div className="text-sm font-medium text-slate-900">No {filter !== 'all' ? filter : ''} bets</div>
                <div className="text-xs text-slate-500 mt-1">
                  {filter === 'pending' ? 'Add a bet to see it here.' : filter === 'completed' ? 'Graded bets will appear here.' : 'Your bet history is empty.'}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-slate-900 mt-1 tabular-nums">{value}</div>
      {sublabel && <div className="text-xs text-slate-400 mt-0.5">{sublabel}</div>}
    </div>
  );
}
