// src/app/ratings/page.tsx
// Refactored main page - ~300 lines orchestrating tab components

'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRatingsData } from './hooks/useRatingsData';
import {
  RatingsTab,
  ScheduleTab,
  HistoryTab,
  HypotheticalsTab,
  MatchingLogsTab,
  OverridesTab,
  BarttovikTab,
  TournamentsTab,
} from './components';
import SBROpenersTab from './components/SBROpenersTab';
import type { TabType, ScheduleFilter, ScheduleSortField, SortDirection } from './types';

export default function RatingsPage() {
  // Main data hook
  const data = useRatingsData();
  
  // Tab state - added 'sbr-openers' to union type inline since TabType is in types.ts
  const [activeTab, setActiveTab] = useState<TabType | 'sbr-openers'>('ratings');
  
  // Schedule tab state (kept here for coordination)
  const [scheduleFilter, setScheduleFilter] = useState<ScheduleFilter>('all');
  const [scheduleSortBy, setScheduleSortBy] = useState<ScheduleSortField>('time');
  const [scheduleSortDir, setScheduleSortDir] = useState<SortDirection>('asc');
  
  // Admin mode (long-press toggle for mobile access)
  const [adminMode, setAdminMode] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const showAdmin = data.isLocalhost || adminMode;

  // Attach non-passive touch listeners for long-press (React registers passive by default)
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;

    const clearPress = () => {
      setIsHolding(false);
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      setIsHolding(true);
      pressTimer.current = setTimeout(() => {
        setIsHolding(false);
        pressTimer.current = null;
        setAdminMode(prev => !prev);
      }, 2000);
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchend', clearPress);
    el.addEventListener('touchcancel', clearPress);
    el.addEventListener('contextmenu', onContextMenu);

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', clearPress);
      el.removeEventListener('touchcancel', clearPress);
      el.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Initial Configuration collapse state
  const [configCollapsed, setConfigCollapsed] = useState(true);
  
  // Sync config state
  const [syncStartDate, setSyncStartDate] = useState('');
  const [syncEndDate, setSyncEndDate] = useState('');
  const [maxGames, setMaxGames] = useState(100);

  // Load data when switching tabs
  useEffect(() => {
    if (showAdmin && activeTab === 'matching' && data.matchingLogs.length === 0) {
      data.loadMatchingLogs();
    }
    if (showAdmin && activeTab === 'overrides' && data.overrides.length === 0) {
      data.loadOverrides();
    }
    if (activeTab === 'schedule') {
      if (data.combinedScheduleGames.length === 0) {
        data.loadSchedule();
      }
      if (data.overrides.length === 0) {
        data.loadOverrides();
      }
      if (data.historyGames.length === 0) {
        data.loadHistory();
      }
    }
    if (activeTab === 'history' && data.historyGames.length === 0) {
      data.loadHistory();
    }
    if (showAdmin && activeTab === 'barttorvik' && data.btGames.length === 0 && data.btRatings.length === 0) {
      data.loadBarttorvik();
    }
  }, [activeTab, showAdmin]);

  const handleCalculate = () => {
    data.calculateRatings({
      startDate: syncStartDate || undefined,
      endDate: syncEndDate || undefined,
      maxGames,
    });
  };

  // For matching logs tab - need to open override modal
  const [, setOverrideModalSource] = useState<{ sourceName?: string; oddsApiName?: string } | null>(null);

  return (
    <div className="min-h-screen bg-blue-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1
                ref={titleRef}
                className={`text-2xl font-bold text-gray-900 select-none ${isHolding ? 'opacity-60' : ''}`}
                style={{ WebkitTouchCallout: 'none', touchAction: 'none' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setIsHolding(true);
                  pressTimer.current = setTimeout(() => {
                    setIsHolding(false);
                    pressTimer.current = null;
                    setAdminMode(prev => !prev);
                  }, 2000);
                }}
                onMouseUp={() => {
                  setIsHolding(false);
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
                onMouseLeave={() => {
                  setIsHolding(false);
                  if (pressTimer.current) {
                    clearTimeout(pressTimer.current);
                    pressTimer.current = null;
                  }
                }}
              >
                Ratings{adminMode && !data.isLocalhost && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full ml-2 align-middle" />}
              </h1>
              <p className="text-sm text-gray-900">Market-adjusted NCAAB power ratings</p>
            </div>
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium">← Back to Odds</Link>
          </div>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Initial Configuration */}
        <div className="bg-white rounded-xl p-6 mb-4 border border-gray-200 shadow-sm">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setConfigCollapsed(!configCollapsed)}
          >
            <div className="flex items-center gap-2">
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${configCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900">Initial Configuration</h2>
            </div>
            <span className="text-xs text-gray-900 bg-gray-100 px-2 py-1 rounded">2025-26 Season</span>
          </div>
          
          {!configCollapsed && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Initial Ratings Source</div>
              <div className="text-lg font-semibold text-gray-900">KenPom Final AdjEM</div>
              <div className="text-sm text-gray-900 mt-1">End of 2024-25 season (Apr 7, 2025)</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Home Court Advantage</div>
              <div className="text-lg font-semibold text-gray-900">{data.hca} points</div>
              <div className="text-sm text-gray-900 mt-1">Added to home team projection</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Opening Lines</div>
              <div className="text-lg font-semibold text-gray-900">SBR Openers</div>
              <div className="text-sm text-gray-900 mt-1">SportsbookReview.com opening spreads</div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Closing Lines</div>
              <div className="text-lg font-semibold text-gray-900">US Consensus Avg</div>
              <div className="text-sm text-gray-900 mt-1">DraftKings, FanDuel, BetMGM, BetRivers</div>
            </div>
          </div>
          
          {/* Status */}
          {(data.syncRange?.lastGameDate || data.snapshot) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {data.syncRange?.lastGameDate && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900">Synced through:</span>
                    <span className="font-semibold text-blue-600">
                      {new Date(data.syncRange.lastGameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {data.snapshot && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">Teams:</span>
                      <span className="text-gray-900">{data.snapshot.ratings.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900">Games processed:</span>
                      <span className="text-gray-900">{data.snapshot.gamesProcessed}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Messages */}
        {data.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {data.error}
            <button onClick={() => data.setError(null)} className="ml-2 text-red-500 hover:text-red-700">×</button>
          </div>
        )}
        
        {data.successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
            {data.successMessage}
            <button onClick={() => data.setSuccessMessage(null)} className="ml-2 text-green-500 hover:text-green-700">×</button>
          </div>
        )}

        {/* Sync Controls (admin only) */}
        {showAdmin && (
          <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-900">Start:</label>
                <input
                  type="date"
                  value={syncStartDate}
                  onChange={(e) => setSyncStartDate(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-900">End:</label>
                <input
                  type="date"
                  value={syncEndDate}
                  onChange={(e) => setSyncEndDate(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-900">Max:</label>
                <input
                  type="number"
                  value={maxGames}
                  onChange={(e) => setMaxGames(parseInt(e.target.value) || 100)}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <button
                onClick={handleCalculate}
                disabled={data.loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                {data.loading ? 'Syncing...' : 'Sync Latest Games'}
              </button>
              <button
                onClick={data.recalculateRatings}
                disabled={data.loading}
                className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 text-sm font-medium"
              >
                Recalculate All
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto">
              {[
                { key: 'ratings' as const, label: 'Ratings', show: true },
                { key: 'schedule' as const, label: 'Schedule', show: true },
                { key: 'history' as const, label: 'History', show: true },
                { key: 'hypotheticals' as const, label: 'Matchups', show: true },
                { key: 'tournaments' as const, label: 'Tournaments', show: true },
                { key: 'sbr-openers' as const, label: 'SBR Openers', show: showAdmin, green: true },
                { key: 'matching' as const, label: 'Matching', show: showAdmin },
                { key: 'overrides' as const, label: 'Overrides', show: showAdmin },
                { key: 'barttorvik' as const, label: 'Barttorvik', show: showAdmin, purple: true },
              ].filter(t => t.show).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === tab.key 
                      ? tab.purple 
                        ? 'border-purple-600 text-purple-600' 
                        : tab.green
                          ? 'border-green-600 text-green-600'
                          : 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-900 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'ratings' && data.snapshot && (
            <RatingsTab
              snapshot={data.snapshot}
              hca={data.hca}
              getTeamLogo={data.getTeamLogo}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleTab
              combinedScheduleGames={data.combinedScheduleGames}
              historyGames={data.historyGames}
              snapshot={data.snapshot}
              overrides={data.overrides}
              hca={data.hca}
              scheduleFilter={scheduleFilter}
              setScheduleFilter={setScheduleFilter}
              scheduleSortBy={scheduleSortBy}
              setScheduleSortBy={setScheduleSortBy}
              scheduleSortDir={scheduleSortDir}
              setScheduleSortDir={setScheduleSortDir}
              scheduleLoading={data.scheduleLoading}
              oddsLoading={data.oddsLoading}
              oddsError={data.oddsError}
              loadSchedule={data.loadSchedule}
              getTeamLogo={data.getTeamLogo}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              historyGames={data.historyGames}
              historyLoading={data.historyLoading}
              loadHistory={data.loadHistory}
              getTeamLogo={data.getTeamLogo}
            />
          )}

          {activeTab === 'hypotheticals' && (
            <HypotheticalsTab
              snapshot={data.snapshot}
              hca={data.hca}
              getTeamLogo={data.getTeamLogo}
            />
          )}

          {activeTab === 'tournaments' && (
            <TournamentsTab
              snapshot={data.snapshot}
              hca={data.hca}
              getTeamLogo={data.getTeamLogo}
            />
          )}

          {activeTab === 'sbr-openers' && (
            <SBROpenersTab />
          )}

          {showAdmin && activeTab === 'matching' && (
            <MatchingLogsTab
              matchingLogs={data.matchingLogs}
              matchingStats={data.matchingStats}
              logsLoading={data.logsLoading}
              nonD1GameIds={data.nonD1GameIds}
              markAsNonD1={data.markAsNonD1}
              openAddOverrideModal={(sourceName, oddsApiName) => {
                setOverrideModalSource({ sourceName, oddsApiName });
                setActiveTab('overrides');
              }}
            />
          )}

          {showAdmin && activeTab === 'overrides' && (
            <OverridesTab
              overrides={data.overrides}
              kenpomTeams={data.kenpomTeams}
              oddsApiTeams={data.oddsApiTeams}
              torvikTeams={data.torvikTeams}
              overridesLoading={data.overridesLoading}
              loadOverrides={data.loadOverrides}
              loadMatchingLogs={data.loadMatchingLogs}
              loadRatings={data.loadRatings}
              setSuccessMessage={data.setSuccessMessage}
              setOverrides={data.setOverrides}
              setKenpomTeams={data.setKenpomTeams}
              setOddsApiTeams={data.setOddsApiTeams}
              setTorvikTeams={data.setTorvikTeams}
            />
          )}

          {showAdmin && activeTab === 'barttorvik' && (
            <BarttovikTab
              btGames={data.btGames}
              btRatings={data.btRatings}
              btLoading={data.btLoading}
              btError={data.btError}
              loadBarttorvik={data.loadBarttorvik}
              syncTorvikTeams={data.syncTorvikTeams}
            />
          )}

          {/* Empty state */}
          {!data.snapshot && !data.loading && activeTab === 'ratings' && (
            <div className="p-8 text-center text-gray-900">
              <div className="text-4xl mb-3">📊</div>
              <p>No ratings data available.</p>
              <p className="text-sm mt-2">Use the sync controls above to process games.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
