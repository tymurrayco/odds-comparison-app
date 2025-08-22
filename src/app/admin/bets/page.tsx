// src/app/admin/bets/page.tsx - Mobile-Optimized Version
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchBets, createBet, updateBet, deleteBet, Bet, BetStatus, BetType } from '@/lib/betService';

export default function BetAdminPage() {
  const router = useRouter();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingBet, setEditingBet] = useState<Bet | null>(null);
  const [showForm, setShowForm] = useState(false); // Start closed on mobil
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [view, setView] = useState<'form' | 'list'>('list'); // Mobile view toggle
  
  // Form state with better defaults
  const getInitialFormState = () => ({
    date: new Date().toISOString().split('T')[0],
    eventDate: new Date().toISOString().split('T')[0],
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
  
  // Load bets on mount
  useEffect(() => {
    loadBets();
  }, []);
  
  const loadBets = async () => {
    try {
      const fetchedBets = await fetchBets();
      setBets(fetchedBets);
    } catch (error) {
      console.error('Error loading bets:', error);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const betData = {
        ...formData,
        awayTeam: formData.awayTeam || undefined,
        homeTeam: formData.homeTeam || undefined,
        team: formData.team || undefined,
        result: formData.result || undefined,
        notes: formData.notes || undefined
      };
      
      if (editingBet) {
        await updateBet(editingBet.id, betData);
      } else {
        await createBet(betData);
      }
      
      // Reset form
      setFormData(getInitialFormState());
      setEditingBet(null);
      
      // Reload bets and switch to list view on mobile
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
  
  // Parse teams from description for quick fill
  const parseAndFillTeams = () => {
    const patterns = [
      /(.+?)\s*@\s*(.+)/,
      /(.+?)\s*vs\.?\s*(.+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = formData.description.match(pattern);
      if (match) {
        setFormData({
          ...formData,
          awayTeam: match[1].trim(),
          homeTeam: match[2].trim()
        });
        break;
      }
    }
  };
  
  // Filter bets
  const filteredBets = bets.filter(bet => {
    if (filter === 'pending') return bet.status === 'pending';
    if (filter === 'completed') return bet.status !== 'pending';
    return true;
  }).sort((a, b) => {
    // Pending bets: sort by event date (earliest first)
    if (a.status === 'pending' && b.status === 'pending') {
      return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
    }
    // Completed bets: sort by event date (most recent first)
    if (a.status !== 'pending' && b.status !== 'pending') {
      return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
    }
    // Pending before completed
    return a.status === 'pending' ? -1 : 1;
  });
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile-Optimized Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-lg font-bold">Bet Admin</h1>
            <button
              onClick={() => router.push('/')}
              className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Done
            </button>
          </div>
          
          {/* Mobile View Toggle */}
          <div className="flex gap-2 mt-3 sm:hidden">
            <button
              onClick={() => {
                setView('form');
                setShowForm(true);
              }}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                view === 'form' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              ➕ Add Bet
            </button>
            <button
              onClick={() => setView('list')}
              className={`flex-1 px-3 py-2 rounded text-sm font-medium ${
                view === 'list' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              📋 List ({bets.length})
            </button>
          </div>
          
          {/* Desktop Actions */}
          <div className="hidden sm:flex gap-2 mt-3">
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              {showForm ? 'Hide Form' : '➕ New Bet'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-4 max-w-7xl mx-auto">
        {/* Entry Form - Mobile Optimized */}
        {(view === 'form' || (showForm && window.innerWidth >= 640)) && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-4 mb-6">
            <h2 className="text-base font-semibold mb-4">
              {editingBet ? 'Edit Bet' : 'Add New Bet'}
            </h2>
            
            {/* Quick Actions - Mobile Friendly */}
            <div className="mb-4 p-3 bg-blue-50 rounded">
              <div className="text-xs font-medium text-blue-900 mb-2">Quick Fill:</div>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                <button
                  type="button"
                  onClick={parseAndFillTeams}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                  disabled={formData.betType === 'future'}
                >
                  📋 Parse Teams
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, odds: -110})}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                >
                  -110
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, stake: 1})}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                >
                  1u
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    setFormData({...formData, eventDate: tomorrow.toISOString().split('T')[0]});
                  }}
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                >
                  Tomorrow
                </button>
              </div>
            </div>
            
            {/* Mobile-First Form Layout */}
            <div className="space-y-4">
              {/* Core Info Section */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Sport</label>
                    <select
                      value={formData.sport}
                      onChange={(e) => setFormData({...formData, sport: e.target.value})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-xs font-medium mb-1">League</label>
                    <select
                      value={formData.league}
                      onChange={(e) => setFormData({...formData, league: e.target.value})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
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
                    <label className="block text-xs font-medium mb-1">Event Date</label>
                    <input
                      type="date"
                      value={formData.eventDate}
                      onChange={(e) => setFormData({...formData, eventDate: e.target.value})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium mb-1">Bet Type</label>
                    <select
                      value={formData.betType}
                      onChange={(e) => setFormData({...formData, betType: e.target.value as BetType})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="spread">Spread</option>
                      <option value="moneyline">ML</option>
                      <option value="total">Total</option>
                      <option value="prop">Prop</option>
                      <option value="parlay">Parlay</option>
                      <option value="future">Future</option>
                    </select>
                  </div>
                </div>
                
                {/* Description - Full Width */}
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Description {formData.betType === 'future' ? '' : '(e.g., Team @ Team)'}
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder={formData.betType === 'future' ? 'Championship/Award' : 'Away @ Home'}
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                {/* Teams - Conditional */}
                {formData.betType === 'future' ? (
                  <div>
                    <label className="block text-xs font-medium mb-1">Team/Player</label>
                    <input
                      type="text"
                      value={formData.team}
                      onChange={(e) => setFormData({...formData, team: e.target.value})}
                      placeholder="e.g., Alabama Crimson Tide"
                      className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Away Team</label>
                      <input
                        type="text"
                        value={formData.awayTeam}
                        onChange={(e) => setFormData({...formData, awayTeam: e.target.value})}
                        placeholder="Optional"
                        className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium mb-1">Home Team</label>
                      <input
                        type="text"
                        value={formData.homeTeam}
                        onChange={(e) => setFormData({...formData, homeTeam: e.target.value})}
                        placeholder="Optional"
                        className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
                
                {/* Bet Details */}
                <div>
                  <label className="block text-xs font-medium mb-1">Bet</label>
                  <input
                    type="text"
                    value={formData.bet}
                    onChange={(e) => setFormData({...formData, bet: e.target.value})}
                    placeholder={
                      formData.betType === 'spread' ? 'Team -3.5' :
                      formData.betType === 'total' ? 'Over 52.5' :
                      formData.betType === 'future' ? 'To win Championship' :
                      'Bet description'
                    }
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                {/* Numbers Row */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Odds</label>
                    <input
                      type="number"
                      value={formData.odds}
                      onChange={(e) => setFormData({...formData, odds: parseInt(e.target.value) || 0})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium mb-1">Units</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.stake}
                      onChange={(e) => setFormData({...formData, stake: parseFloat(e.target.value) || 0})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium mb-1">Book</label>
                    <select
                      value={formData.book}
                      onChange={(e) => setFormData({...formData, book: e.target.value})}
                      className="w-full px-2 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="FanDuel">FD</option>
                      <option value="DraftKings">DK</option>
                      <option value="BetMGM">MGM</option>
                      <option value="BetRivers">BR</option>
                      <option value="Caesars">CZR</option>
                    </select>
                  </div>
                </div>
                
                {/* Notes - Optional */}
                <div>
                  <label className="block text-xs font-medium mb-1">Notes (optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Reasoning..."
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                  />
                </div>
              </div>
            </div>
            
            {/* Form Actions */}
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingBet ? 'Update' : 'Add Bet'}
              </button>
              
              {editingBet && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingBet(null);
                    setFormData(getInitialFormState());
                  }}
                  className="px-4 py-2.5 bg-gray-500 text-white rounded-lg"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
        
        {/* Bets List - Mobile Optimized */}
        {(view === 'list' || window.innerWidth >= 640) && (
          <div className="bg-white rounded-lg shadow-lg p-4">
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100'
                }`}
              >
                All ({bets.length})
              </button>
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  filter === 'pending' ? 'bg-orange-500 text-white' : 'bg-gray-100'
                }`}
              >
                Pending ({bets.filter(b => b.status === 'pending').length})
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  filter === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-100'
                }`}
              >
                Done ({bets.filter(b => b.status !== 'pending').length})
              </button>
            </div>
            
            {/* Mobile: Card View, Desktop: Table View */}
            <div className="sm:hidden space-y-3">
              {/* Mobile Cards */}
              {filteredBets.map((bet) => (
                <div key={bet.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{bet.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(bet.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })} • {bet.league}
                      </div>
                    </div>
                    <select
                      value={bet.status}
                      onChange={(e) => handleQuickStatusUpdate(bet, e.target.value as BetStatus)}
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        bet.status === 'won' ? 'bg-green-100 text-green-800' :
                        bet.status === 'lost' ? 'bg-red-100 text-red-800' :
                        bet.status === 'push' ? 'bg-gray-100 text-gray-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      <option value="pending">Pending</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="push">Push</option>
                    </select>
                  </div>
                  
                  <div className="text-sm font-medium text-blue-600 mb-2">
                    {bet.bet}
                  </div>
                  
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex gap-3">
                      <span>{bet.odds > 0 ? '+' : ''}{bet.odds}</span>
                      <span>{bet.stake}u</span>
                      <span className="text-gray-500">{bet.book}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(bet)}
                        className="text-blue-600 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(bet.id)}
                        className="text-red-600 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  {bet.notes && (
                    <div className="mt-2 pt-2 border-t text-xs text-gray-600">
                      {bet.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {/* Desktop Table (hidden on mobile) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-left p-2">Bet</th>
                    <th className="text-left p-2">Odds</th>
                    <th className="text-left p-2">Units</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Book</th>
                    <th className="text-left p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBets.map((bet) => (
                    <tr key={bet.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        {new Date(bet.eventDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{bet.description}</div>
                        <div className="text-xs text-gray-500">{bet.league}</div>
                      </td>
                      <td className="p-2 font-medium text-blue-600">{bet.bet}</td>
                      <td className="p-2">{bet.odds > 0 ? '+' : ''}{bet.odds}</td>
                      <td className="p-2">{bet.stake}</td>
                      <td className="p-2">
                        <select
                          value={bet.status}
                          onChange={(e) => handleQuickStatusUpdate(bet, e.target.value as BetStatus)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            bet.status === 'won' ? 'bg-green-100 text-green-800' :
                            bet.status === 'lost' ? 'bg-red-100 text-red-800' :
                            bet.status === 'push' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          <option value="pending">Pending</option>
                          <option value="won">Won</option>
                          <option value="lost">Lost</option>
                          <option value="push">Push</option>
                        </select>
                      </td>
                      <td className="p-2 text-xs">{bet.book}</td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(bet)}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <span className="text-gray-400">|</span>
                          <button
                            onClick={() => handleDelete(bet.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredBets.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No {filter !== 'all' ? filter : ''} bets found.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}