'use client';

import React from 'react';
import { TeamLogo } from '../TeamLogo';
import { formatRating } from '@/lib/ratings/engine';
import { probToOdds } from '../../utils/tournamentProjection';
import type { BracketTeam } from '../../types/tournament';

interface AdvanceColumn {
  label: string;
  probs: Map<string, number>;
}

interface SeedingPanelProps {
  teams: BracketTeam[];
  maxSeeds: number;
  onReorder: (teams: BracketTeam[]) => void;
  onToggleIneligible: (teamName: string) => void;
  getTeamLogo: (teamName: string) => string | null;
  tournamentWinProbs: Map<string, number>;
  eliminatedTeams: Set<string>;
  regionSize?: number;
  regionNames?: string[];
  advanceColumns?: AdvanceColumn[];
}

function formatPct(prob: number): string {
  if (prob >= 0.995) return '>99%';
  if (prob < 0.005) return '<1%';
  const pct = Math.round(prob * 100);
  return `${pct}%`;
}

export function SeedingPanel({ teams, maxSeeds, onReorder, onToggleIneligible, getTeamLogo, tournamentWinProbs, eliminatedTeams, regionSize, regionNames, advanceColumns }: SeedingPanelProps) {
  const eligible = teams.filter(t => !t.ineligible);
  const ineligible = teams.filter(t => t.ineligible);
  const displayTeams = eligible.slice(0, maxSeeds);
  const outsideBracket = eligible.slice(maxSeeds);
  const hasAdvance = advanceColumns && advanceColumns.length > 0;

  // Move within seeded, or across the seeded/outside boundary
  function moveEligible(eligibleIndex: number, direction: 'up' | 'down') {
    const swapWith = direction === 'up' ? eligibleIndex - 1 : eligibleIndex + 1;
    if (swapWith < 0 || swapWith >= eligible.length) return;

    const updated = [...eligible];
    [updated[eligibleIndex], updated[swapWith]] = [updated[swapWith], updated[eligibleIndex]];
    const reseeded = updated.map((t, i) => ({ ...t, seed: i < maxSeeds ? i + 1 : 0 }));

    onReorder([...reseeded, ...ineligible]);
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-2">
        Seeding ({displayTeams.length} of {eligible.length} eligible){hasAdvance && <span className="text-gray-400 ml-1">— hover for implied price</span>}
      </div>

      {/* Column headers for advance probabilities */}
      {hasAdvance && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 mb-1">
          {/* Spacer for seed + buttons + logo */}
          <span className="w-5 flex-shrink-0" />
          <span className="w-[26px] flex-shrink-0" />
          <span className="w-4 flex-shrink-0" />
          {advanceColumns!.map(col => (
            <span key={col.label} className="text-[9px] font-bold text-gray-500 text-center flex-shrink-0 w-9">
              {col.label}
            </span>
          ))}
          <span className="flex-1" />
        </div>
      )}

      <div className={`space-y-0.5 overflow-y-auto ${regionSize ? 'max-h-[400px] sm:max-h-[700px]' : 'max-h-[300px] sm:max-h-[500px]'}`}>
        {displayTeams.map((team, idx) => {
          const isEliminated = eliminatedTeams.has(team.teamName);
          const showRegionLabel = regionSize && regionNames && idx % regionSize === 0;
          const regionIndex = regionSize ? Math.floor(idx / regionSize) : 0;
          const regionSeed = team.displaySeed ?? (regionSize ? (idx % regionSize) + 1 : team.seed);
          return (
          <React.Fragment key={team.teamName}>
          {showRegionLabel && (
            <div className={`text-[10px] font-bold text-blue-600 uppercase tracking-wider px-2 py-1 bg-blue-50 rounded ${idx > 0 ? 'mt-2 border-t border-blue-200' : ''}`}>
              {regionNames[regionIndex] || `Region ${regionIndex + 1}`}
            </div>
          )}
          <div
            className={`flex items-center gap-1 px-2 py-1 text-sm rounded hover:bg-gray-50 group ${isEliminated ? 'opacity-60' : ''}`}
          >
            <span className="w-5 text-xs text-gray-400 text-right flex-shrink-0">{regionSeed}</span>
            <div className="flex gap-0.5 flex-shrink-0">
              <button
                onClick={() => moveEligible(idx, 'up')}
                disabled={idx === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs p-1.5 -m-1"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => moveEligible(idx, 'down')}
                disabled={idx === eligible.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs p-1.5 -m-1"
                title={idx === displayTeams.length - 1 && outsideBracket.length > 0 ? 'Move out of bracket' : 'Move down'}
              >
                ▼
              </button>
            </div>
            <TeamLogo
              teamName={team.teamName}
              logoUrl={getTeamLogo(team.teamName)}
              size="sm"
            />
            {hasAdvance ? (
              <>
                {/* Advance probability columns - no team name, logo is enough */}
                {advanceColumns!.map(col => {
                  const prob = col.probs.get(team.teamName);
                  if (prob == null || prob <= 0) {
                    return <span key={col.label} className="text-[9px] text-gray-300 text-center flex-shrink-0 w-9 tabular-nums">—</span>;
                  }
                  const isChamp = col.label === 'Champ';
                  return (
                    <span
                      key={col.label}
                      className={`text-[9px] text-center flex-shrink-0 w-9 tabular-nums ${
                        isEliminated ? 'text-gray-400' :
                        prob >= 0.5 ? 'text-green-600 font-medium' :
                        prob >= 0.2 ? 'text-gray-700' : 'text-gray-400'
                      }`}
                      title={probToOdds(prob)}
                    >
                      {isChamp ? (
                        <span>{formatPct(prob)}</span>
                      ) : (
                        formatPct(prob)
                      )}
                    </span>
                  );
                })}
                {/* Champ odds inline */}
                {(() => {
                  const champCol = advanceColumns!.find(c => c.label === 'Champ');
                  const champProb = champCol?.probs.get(team.teamName);
                  if (champProb != null && champProb > 0) {
                    return (
                      <span className={`text-[9px] flex-shrink-0 tabular-nums font-medium ${champProb >= 0.5 ? 'text-green-600' : 'text-amber-600'}`}>
                        {probToOdds(champProb)}
                      </span>
                    );
                  }
                  return null;
                })()}
              </>
            ) : (
              <>
                {/* Standard: team name + win prob */}
                <span className={`truncate flex-1 min-w-0 ${isEliminated ? 'text-red-400 line-through' : 'text-gray-900'}`}>{team.teamName}</span>
                {(() => {
                  const winProb = tournamentWinProbs.get(team.teamName);
                  if (winProb != null && winProb > 0) {
                    const pct = Math.round(winProb * 1000) / 10;
                    const odds = probToOdds(winProb);
                    return (
                      <span className="text-[10px] flex-shrink-0 tabular-nums text-right" style={{ minWidth: '70px' }}>
                        <span className="text-gray-400">{pct}%</span>
                        {' '}
                        <span className={`font-medium ${winProb >= 0.5 ? 'text-green-600' : 'text-amber-600'}`}>{odds}</span>
                      </span>
                    );
                  }
                  return <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{formatRating(team.rating)}</span>;
                })()}
              </>
            )}
            <button
              onClick={() => onToggleIneligible(team.teamName)}
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs flex-shrink-0"
              title="Mark ineligible"
            >
              ✕
            </button>
          </div>
          </React.Fragment>
          );
        })}

        {/* Teams outside bracket (eligible but didn't make the cut) */}
        {outsideBracket.length > 0 && (
          <>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider pt-2 pb-1 px-2 border-t border-gray-200 mt-1">
              Outside Bracket
            </div>
            {outsideBracket.map((team, idx) => {
              const eligibleIdx = maxSeeds + idx;
              return (
                <div
                  key={team.teamName}
                  className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-gray-50 group opacity-60"
                >
                  <span className="w-5 flex-shrink-0" />
                  <div className="flex gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveEligible(eligibleIdx, 'up')}
                      className="text-gray-300 hover:text-gray-600 text-xs p-1.5 -m-1"
                      title="Move into bracket"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveEligible(eligibleIdx, 'down')}
                      disabled={eligibleIdx === eligible.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs p-1.5 -m-1"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <TeamLogo
                    teamName={team.teamName}
                    logoUrl={getTeamLogo(team.teamName)}
                    size="sm"
                  />
                  <span className="truncate flex-1 min-w-0 text-gray-600">{team.teamName}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{formatRating(team.rating)}</span>
                  <button
                    onClick={() => onToggleIneligible(team.teamName)}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 text-xs flex-shrink-0"
                    title="Mark ineligible"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* Ineligible teams */}
        {ineligible.length > 0 && (
          <>
            <div className="text-[10px] font-medium text-red-400 uppercase tracking-wider pt-2 pb-1 px-2 border-t border-gray-200 mt-1">
              Ineligible
            </div>
            {ineligible.map((team) => (
              <div
                key={team.teamName}
                className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-gray-50 group opacity-50"
              >
                <span className="w-5 flex-shrink-0" />
                <span className="w-[26px] flex-shrink-0" />
                <TeamLogo
                  teamName={team.teamName}
                  logoUrl={getTeamLogo(team.teamName)}
                  size="sm"
                />
                <span className="truncate flex-1 min-w-0 text-gray-400 line-through">{team.teamName}</span>
                <span className="text-xs text-gray-300 flex-shrink-0 tabular-nums">{formatRating(team.rating)}</span>
                <button
                  onClick={() => onToggleIneligible(team.teamName)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-green-600 text-xs flex-shrink-0"
                  title="Restore eligibility"
                >
                  ↩
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
