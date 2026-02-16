// src/app/lacrosse-ratings/components/HypotheticalsTab.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { TeamLogo } from '@/app/ratings/components/TeamLogo';
import { formatRating } from '@/lib/ratings/engine';
import type { RatingsSnapshot } from '@/lib/lacrosse/types';

interface HypotheticalsTabProps {
  snapshot: RatingsSnapshot | null;
  hca: number;
  getTeamLogo: (teamName: string) => string | null;
}

export function HypotheticalsTab({ snapshot, hca, getTeamLogo }: HypotheticalsTabProps) {
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [isNeutralSite, setIsNeutralSite] = useState(false);
  const [homeTeamSearch, setHomeTeamSearch] = useState('');
  const [awayTeamSearch, setAwayTeamSearch] = useState('');
  const [showHomeDropdown, setShowHomeDropdown] = useState(false);
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);

  const sortedTeams = useMemo(() => {
    if (!snapshot?.ratings) return [];
    return [...snapshot.ratings].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }, [snapshot?.ratings]);

  const filteredHomeTeams = useMemo(() => {
    if (!homeTeamSearch) return sortedTeams.slice(0, 20);
    const search = homeTeamSearch.toLowerCase();
    return sortedTeams.filter(t => t.teamName.toLowerCase().includes(search)).slice(0, 20);
  }, [sortedTeams, homeTeamSearch]);

  const filteredAwayTeams = useMemo(() => {
    if (!awayTeamSearch) return sortedTeams.slice(0, 20);
    const search = awayTeamSearch.toLowerCase();
    return sortedTeams.filter(t => t.teamName.toLowerCase().includes(search)).slice(0, 20);
  }, [sortedTeams, awayTeamSearch]);

  const matchupProjection = useMemo(() => {
    if (!snapshot || !homeTeam || !awayTeam) return null;

    const homeRating = snapshot.ratings.find(r => r.teamName === homeTeam);
    const awayRating = snapshot.ratings.find(r => r.teamName === awayTeam);

    if (!homeRating || !awayRating) return null;

    const hcaToApply = isNeutralSite ? 0 : hca;
    const projectedSpread = -((homeRating.rating - awayRating.rating) + hcaToApply);

    return {
      homeTeam,
      awayTeam,
      homeRating: homeRating.rating,
      awayRating: awayRating.rating,
      homeConference: homeRating.conference,
      awayConference: awayRating.conference,
      projectedSpread,
      hcaApplied: hcaToApply,
      isNeutralSite,
    };
  }, [snapshot, homeTeam, awayTeam, isNeutralSite, hca]);

  const swapTeams = () => {
    const tempTeam = homeTeam;
    const tempSearch = homeTeamSearch;
    setHomeTeam(awayTeam);
    setHomeTeamSearch(awayTeamSearch);
    setAwayTeam(tempTeam);
    setAwayTeamSearch(tempSearch);
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Hypothetical Matchup Calculator</h2>
        <p className="text-sm text-gray-900 mb-6">Select two teams to see the projected spread based on current power ratings.</p>

        {!snapshot ? (
          <div className="text-center py-8 text-gray-900">
            <p>No ratings available. Sync games first to use the hypothetical matchup calculator.</p>
          </div>
        ) : (
          <>
            {/* Team Selection */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-end mb-6">
              {/* Away Team */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-900 mb-1">Away Team</label>
                <input
                  type="text"
                  value={awayTeamSearch}
                  onChange={(e) => {
                    setAwayTeamSearch(e.target.value);
                    setShowAwayDropdown(true);
                    if (!e.target.value) setAwayTeam('');
                  }}
                  onFocus={() => setShowAwayDropdown(true)}
                  onBlur={() => setTimeout(() => setShowAwayDropdown(false), 200)}
                  placeholder="Search team..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showAwayDropdown && filteredAwayTeams.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredAwayTeams.map(team => (
                      <button
                        key={team.teamName}
                        onMouseDown={() => {
                          setAwayTeam(team.teamName);
                          setAwayTeamSearch(team.teamName);
                          setShowAwayDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-blue-50 text-sm flex justify-between items-center"
                      >
                        <span>{team.teamName}</span>
                        <span className="text-gray-400 text-xs">{formatRating(team.rating)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div className="flex justify-center">
                <button
                  onClick={swapTeams}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                  title="Swap teams"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </button>
              </div>

              {/* Home Team */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-900 mb-1">Home Team</label>
                <input
                  type="text"
                  value={homeTeamSearch}
                  onChange={(e) => {
                    setHomeTeamSearch(e.target.value);
                    setShowHomeDropdown(true);
                    if (!e.target.value) setHomeTeam('');
                  }}
                  onFocus={() => setShowHomeDropdown(true)}
                  onBlur={() => setTimeout(() => setShowHomeDropdown(false), 200)}
                  placeholder="Search team..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showHomeDropdown && filteredHomeTeams.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {filteredHomeTeams.map(team => (
                      <button
                        key={team.teamName}
                        onMouseDown={() => {
                          setHomeTeam(team.teamName);
                          setHomeTeamSearch(team.teamName);
                          setShowHomeDropdown(false);
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-blue-50 text-sm flex justify-between items-center"
                      >
                        <span>{team.teamName}</span>
                        <span className="text-gray-400 text-xs">{formatRating(team.rating)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Neutral Site Checkbox */}
            <div className="flex items-center justify-center mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isNeutralSite}
                  onChange={(e) => setIsNeutralSite(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-900">Neutral Site</span>
              </label>
            </div>

            {/* Projection Result */}
            {matchupProjection && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                <div className="grid grid-cols-3 gap-4 items-center mb-6">
                  {/* Away Team */}
                  <div className="text-center">
                    <TeamLogo
                      teamName={matchupProjection.awayTeam}
                      logoUrl={getTeamLogo(matchupProjection.awayTeam)}
                      size="lg"
                      className="mx-auto mb-2"
                    />
                    <div className="text-lg font-bold text-gray-900">{matchupProjection.awayTeam}</div>
                    <div className="text-xs text-gray-900">{matchupProjection.awayConference || 'Unknown'}</div>
                    <div className="text-sm font-mono text-gray-900 mt-1">
                      {formatRating(matchupProjection.awayRating)}
                    </div>
                  </div>

                  {/* @ Symbol */}
                  <div className="text-center text-2xl text-gray-400 font-light">@</div>

                  {/* Home Team */}
                  <div className="text-center">
                    <TeamLogo
                      teamName={matchupProjection.homeTeam}
                      logoUrl={getTeamLogo(matchupProjection.homeTeam)}
                      size="lg"
                      className="mx-auto mb-2"
                    />
                    <div className="text-lg font-bold text-gray-900">{matchupProjection.homeTeam}</div>
                    <div className="text-xs text-gray-900">{matchupProjection.homeConference || 'Unknown'}</div>
                    <div className="text-sm font-mono text-gray-900 mt-1">
                      {formatRating(matchupProjection.homeRating)}
                    </div>
                  </div>
                </div>

                {/* Projected Spread */}
                <div className="text-center border-t border-blue-200 pt-4">
                  <div className="text-sm text-gray-900 mb-1">Projected Spread</div>
                  <div className={`text-4xl font-bold ${
                    matchupProjection.projectedSpread < 0 ? 'text-green-600' :
                    matchupProjection.projectedSpread > 0 ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {matchupProjection.homeTeam} {matchupProjection.projectedSpread === 0 ? 'PK' : `${matchupProjection.projectedSpread > 0 ? '+' : ''}${Math.round(matchupProjection.projectedSpread * 100) / 100}`}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {isNeutralSite ? 'Neutral site (no HFA)' : `Includes ${hca} goal HFA`}
                  </div>
                </div>

                {/* Calculation Breakdown */}
                <div className="mt-4 pt-4 border-t border-blue-200 text-xs text-gray-900 text-center font-mono">
                  Home Rating ({formatRating(matchupProjection.homeRating)}) - Away Rating ({formatRating(matchupProjection.awayRating)})
                  {!isNeutralSite && <> + HFA ({hca})</>} = {Math.round((matchupProjection.homeRating - matchupProjection.awayRating + matchupProjection.hcaApplied) * 100) / 100} →
                  <span className="font-semibold"> Spread: {matchupProjection.projectedSpread === 0 ? 'PK' : `${matchupProjection.projectedSpread > 0 ? '+' : ''}${Math.round(matchupProjection.projectedSpread * 100) / 100}`}</span>
                </div>
              </div>
            )}

            {/* Empty state when only one team selected */}
            {!matchupProjection && (homeTeam || awayTeam) && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-900 border border-gray-200">
                Select both teams to see the projected spread.
              </div>
            )}

            {/* Empty state when no teams selected */}
            {!matchupProjection && !homeTeam && !awayTeam && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-900 border border-gray-200">
                <div className="text-4xl mb-3">🥍</div>
                <p>Search and select teams above to calculate a projected spread.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
