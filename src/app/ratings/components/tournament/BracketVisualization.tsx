'use client';

import React from 'react';
import { BracketRound } from './BracketRound';
import type { BracketMatchup, BracketTemplate } from '../../types/tournament';

interface BracketVisualizationProps {
  template: BracketTemplate;
  matchups: BracketMatchup[];
  onPickWinner: (matchupId: string, side: 'top' | 'bottom') => void;
  getTeamLogo: (teamName: string) => string | null;
}

export function BracketVisualization({
  template,
  matchups,
  onPickWinner,
  getTeamLogo,
}: BracketVisualizationProps) {
  // Group matchups by round
  const rounds = template.rounds.map(roundDef => ({
    round: roundDef.round,
    name: roundDef.name,
    matchups: matchups
      .filter(m => m.round === roundDef.round)
      .sort((a, b) => a.position - b.position),
  }));

  // Find the champion
  const finalRound = rounds[rounds.length - 1];
  const finalMatchup = finalRound?.matchups[0];
  const champion = finalMatchup?.winner === 'top'
    ? finalMatchup.topTeam
    : finalMatchup?.winner === 'bottom'
      ? finalMatchup.bottomTeam
      : null;

  return (
    <div className="w-full">
      {/* Bracket grid - horizontal scroll */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-stretch gap-8 min-w-max px-4 py-4">
          {rounds.map((round, idx) => (
            <BracketRound
              key={round.round}
              roundName={round.name}
              matchups={round.matchups}
              onPickWinner={onPickWinner}
              getTeamLogo={getTeamLogo}
              roundIndex={idx}
              totalRounds={rounds.length}
            />
          ))}

          {/* Champion display */}
          <div className="flex flex-col items-center justify-center flex-shrink-0">
            <div className="text-xs font-medium text-gray-500 mb-3">Champion</div>
            <div className="flex flex-col items-center justify-center">
              {champion ? (
                <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg px-4 py-3 text-center shadow-sm">
                  <div className="text-lg font-bold text-gray-900">{champion.teamName}</div>
                  <div className="text-xs text-gray-500">#{champion.seed} seed</div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg px-4 py-3 text-center">
                  <div className="text-sm text-gray-400">TBD</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
