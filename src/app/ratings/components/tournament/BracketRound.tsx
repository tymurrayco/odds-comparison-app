'use client';

import React from 'react';
import { BracketMatchupCard } from './BracketMatchupCard';
import type { BracketMatchup } from '../../types/tournament';

interface BracketRoundProps {
  roundName: string;
  matchups: BracketMatchup[];
  onPickWinner: (matchupId: string, side: 'top' | 'bottom') => void;
  getTeamLogo: (teamName: string) => string | null;
  roundIndex: number;
}

export function BracketRound({
  roundName,
  matchups,
  onPickWinner,
  getTeamLogo,
  roundIndex,
}: BracketRoundProps) {
  // Spacing increases per round so matchups align with their feeder games
  // First round: tight. Each subsequent round doubles spacing.
  const gapMultiplier = Math.pow(2, roundIndex);

  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="text-xs font-medium text-gray-500 mb-3 whitespace-nowrap">
        {roundName}
      </div>
      <div
        className="flex flex-col justify-around flex-1"
        style={{ gap: `${gapMultiplier * 16}px` }}
      >
        {matchups.map(matchup => (
          <div key={matchup.id} className="flex items-center">
            <BracketMatchupCard
              matchup={matchup}
              onPickWinner={onPickWinner}
              getTeamLogo={getTeamLogo}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
