// src/app/lacrosse-ratings/page.tsx
'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useLacrosseData } from './hooks/useLacrosseData';
import { RatingsTab } from './components/RatingsTab';
import { HypotheticalsTab } from './components/HypotheticalsTab';

type TabType = 'ratings' | 'hypotheticals';

export default function LacrosseRatingsPage() {
  const data = useLacrosseData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<TabType>('ratings');
  const [syncStartDate, setSyncStartDate] = useState('');
  const [syncEndDate, setSyncEndDate] = useState('');
  const [maxGames, setMaxGames] = useState(200);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    await data.importCsv(text);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSync = () => {
    data.calculateRatings({
      startDate: syncStartDate || undefined,
      endDate: syncEndDate || undefined,
      maxGames,
    });
  };

  return (
    <div className="min-h-screen bg-blue-50 text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lacrosse Ratings</h1>
              <p className="text-sm text-gray-900">Market-adjusted NCAAL power ratings</p>
            </div>
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm font-medium">&larr; Back to Odds</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Messages */}
        {data.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            {data.error}
            <button onClick={() => data.setError(null)} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {data.successMessage && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
            {data.successMessage}
            <button onClick={() => data.setSuccessMessage(null)} className="ml-2 text-green-500 hover:text-green-700">&times;</button>
          </div>
        )}

        {/* Sync & Import Controls (localhost only) */}
        {data.isLocalhost && (
          <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm space-y-3">
            {/* Sync Controls */}
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
                  onChange={(e) => setMaxGames(parseInt(e.target.value) || 200)}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <button
                onClick={handleSync}
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
            {/* CSV Import */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-100">
              <label className="text-sm text-gray-900 font-medium">Import Massey CSV:</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileImport}
                className="text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>
        )}

        {/* Configuration Summary */}
        {data.snapshot && (
          <div className="bg-white rounded-xl p-6 mb-4 border border-gray-200 shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Rating Source</div>
                <div className="text-lg font-semibold text-gray-900">Massey Composite</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Home Field Advantage</div>
                <div className="text-lg font-semibold text-gray-900">{data.hca} goals</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Teams</div>
                <div className="text-lg font-semibold text-gray-900">{data.snapshot.ratings.length}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-900 uppercase tracking-wide mb-1">Games Processed</div>
                <div className="text-lg font-semibold text-gray-900">{data.snapshot.gamesProcessed}</div>
              </div>
            </div>
            {data.syncRange?.lastGameDate && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-900">Synced through:</span>
                    <span className="font-semibold text-blue-600">
                      {new Date(data.syncRange.lastGameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-200">
            <nav className="flex">
              {(['ratings', 'hypotheticals'] as TabType[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab === 'ratings' ? 'Ratings' : 'Hypotheticals'}
                </button>
              ))}
            </nav>
          </div>

          {activeTab === 'ratings' && data.snapshot && (
            <RatingsTab
              snapshot={data.snapshot}
              hca={data.hca}
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

          {/* Empty state */}
          {activeTab === 'ratings' && !data.snapshot && !data.loading && (
            <div className="p-8 text-center text-gray-900">
              <div className="text-4xl mb-3">🥍</div>
              <p>No lacrosse ratings data available.</p>
              <p className="text-sm mt-2">Import a Massey CSV using the controls above.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
