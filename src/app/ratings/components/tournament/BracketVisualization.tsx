'use client';

import React from 'react';
import { BracketRound } from './BracketRound';
import { BracketMatchupCard } from './BracketMatchupCard';
import type { BracketMatchup, BracketTemplate } from '../../types/tournament';

interface BracketVisualizationProps {
  template: BracketTemplate;
  matchups: BracketMatchup[];
  onPickWinner: (matchupId: string, side: 'top' | 'bottom') => void;
  onToggleCompleted: (matchupId: string) => void;
  getTeamLogo: (teamName: string) => string | null;
  regionNames?: string[];
}

/** Standard bracket visualization (non-NCAA) */
function StandardBracket({
  template,
  matchups,
  onPickWinner,
  onToggleCompleted,
  getTeamLogo,
}: Omit<BracketVisualizationProps, 'regionNames'>) {
  const rounds = template.rounds.map(roundDef => ({
    round: roundDef.round,
    name: roundDef.name,
    matchups: matchups
      .filter(m => m.round === roundDef.round)
      .sort((a, b) => a.position - b.position),
  }));

  const finalRound = rounds[rounds.length - 1];
  const finalMatchup = finalRound?.matchups[0];
  const champion = finalMatchup?.winner === 'top'
    ? finalMatchup.topTeam
    : finalMatchup?.winner === 'bottom'
      ? finalMatchup.bottomTeam
      : null;

  return (
    <div className="w-full bg-blue-50 rounded-lg">
      <div className="overflow-x-auto pb-4">
        <div className="flex items-stretch gap-4 sm:gap-8 min-w-max px-2 sm:px-4 py-4">
          {rounds.map((round, idx) => (
            <BracketRound
              key={round.round}
              roundName={round.name}
              matchups={round.matchups}
              onPickWinner={onPickWinner}
              onToggleCompleted={onToggleCompleted}
              getTeamLogo={getTeamLogo}
              roundIndex={idx}
            />
          ))}
          <ChampionDisplay champion={champion} />
        </div>
      </div>
    </div>
  );
}

function ChampionDisplay({ champion }: { champion: { teamName: string; seed: number; displaySeed?: number } | null }) {
  return (
    <div className="flex flex-col items-center justify-center flex-shrink-0">
      <div className="text-xs font-medium text-gray-500 mb-3">Champion</div>
      <div className="flex flex-col items-center justify-center">
        {champion ? (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg px-4 py-3 text-center shadow-sm">
            <div className="text-lg font-bold text-gray-900">{champion.teamName}</div>
            <div className="text-xs text-gray-500">#{champion.displaySeed ?? champion.seed} seed</div>
          </div>
        ) : (
          <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg px-4 py-3 text-center">
            <div className="text-sm text-gray-400">TBD</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** NCAA 64-team bracket: 4 regional sub-brackets + Final Four */
function NCAATournamentBracket({
  template,
  matchups,
  onPickWinner,
  onToggleCompleted,
  getTeamLogo,
  regionNames = ['Region 1', 'Region 2', 'Region 3', 'Region 4'],
}: BracketVisualizationProps) {
  // Split matchups by region based on position within each round
  // Round 1: 32 matchups, 8 per region (pos 0-7, 8-15, 16-23, 24-31)
  // Round 2: 16 matchups, 4 per region
  // Round 3 (Sweet 16): 8, 2 per region
  // Round 4 (Elite 8): 4, 1 per region
  // Round 5 (Final Four): 2 games (cross-region)
  // Round 6 (Championship): 1 game
  const firstFourRound = template.rounds.find(r => r.round === 0);
  const regionalRounds = template.rounds.filter(r => r.round >= 1 && r.round <= 4);
  const finalFourRounds = template.rounds.filter(r => r.round >= 5);

  function getRegionMatchups(regionIndex: number) {
    const regionMatchups: { round: number; name: string; matchups: BracketMatchup[] }[] = [];

    for (const roundDef of regionalRounds) {
      const roundMatchups = matchups
        .filter(m => m.round === roundDef.round)
        .sort((a, b) => a.position - b.position);

      const perRegion = roundMatchups.length / 4;
      const start = regionIndex * perRegion;
      const end = start + perRegion;
      const regionRoundMatchups = roundMatchups.slice(start, end);

      regionMatchups.push({
        round: roundDef.round,
        name: roundDef.name,
        matchups: regionRoundMatchups,
      });
    }

    return regionMatchups;
  }

  // Get Final Four and Championship matchups
  const finalFourMatchups = finalFourRounds.map(roundDef => ({
    round: roundDef.round,
    name: roundDef.name,
    matchups: matchups
      .filter(m => m.round === roundDef.round)
      .sort((a, b) => a.position - b.position),
  }));

  const finalMatchup = finalFourMatchups[finalFourMatchups.length - 1]?.matchups[0];
  const champion = finalMatchup?.winner === 'top'
    ? finalMatchup.topTeam
    : finalMatchup?.winner === 'bottom'
      ? finalMatchup.bottomTeam
      : null;

  // First Four matchups
  const firstFourMatchups = firstFourRound
    ? matchups.filter(m => m.round === 0).sort((a, b) => a.position - b.position)
    : [];

  return (
    <div className="w-full space-y-6">
      {/* First Four play-in games */}
      {firstFourMatchups.length > 0 && (
        <div className="bg-amber-50 rounded-lg">
          <div className="px-3 pt-2 pb-1">
            <h3 className="text-sm font-bold text-amber-700">First Four</h3>
          </div>
          <div className="overflow-x-auto pb-3">
            <div className="flex items-center gap-3 flex-wrap px-2 py-2">
              {firstFourMatchups.map(m => (
                <BracketMatchupCard
                  key={m.id}
                  matchup={m}
                  onPickWinner={onPickWinner}
                  onToggleCompleted={onToggleCompleted}
                  getTeamLogo={getTeamLogo}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4 regions in a 2x2 grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[0, 1, 2, 3].map(regionIdx => {
          const regionRounds = getRegionMatchups(regionIdx);
          return (
            <div key={regionIdx} className="bg-blue-50 rounded-lg">
              <div className="px-3 pt-2 pb-1">
                <h3 className="text-sm font-bold text-blue-700">{regionNames[regionIdx]}</h3>
              </div>
              <div className="overflow-x-auto pb-3">
                <div className="flex items-stretch gap-3 sm:gap-6 min-w-max px-2 py-2">
                  {regionRounds.map((round, idx) => (
                    <BracketRound
                      key={round.round}
                      roundName={round.name}
                      matchups={round.matchups}
                      onPickWinner={onPickWinner}
                      onToggleCompleted={onToggleCompleted}
                      getTeamLogo={getTeamLogo}
                      roundIndex={idx}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Final Four + Championship */}
      <div className="bg-blue-50 rounded-lg">
        <div className="px-3 pt-2 pb-1">
          <h3 className="text-sm font-bold text-blue-700">Final Four & Championship</h3>
        </div>
        <div className="overflow-x-auto pb-3">
          <div className="flex items-stretch gap-4 sm:gap-8 min-w-max px-2 py-2">
            {finalFourMatchups.map((round, idx) => (
              <BracketRound
                key={round.round}
                roundName={round.name}
                matchups={round.matchups}
                onPickWinner={onPickWinner}
                onToggleCompleted={onToggleCompleted}
                getTeamLogo={getTeamLogo}
                roundIndex={idx}
              />
            ))}
            <ChampionDisplay champion={champion} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function BracketVisualization(props: BracketVisualizationProps) {
  if (props.template.id === '64-team') {
    return <NCAATournamentBracket {...props} />;
  }
  return <StandardBracket {...props} />;
}
