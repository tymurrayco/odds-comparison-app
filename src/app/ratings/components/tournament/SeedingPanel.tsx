'use client';

import React from 'react';
import { TeamLogo } from '../TeamLogo';
import { formatRating } from '@/lib/ratings/engine';
import type { BracketTeam } from '../../types/tournament';

interface SeedingPanelProps {
  teams: BracketTeam[];
  maxSeeds: number;
  onReorder: (teams: BracketTeam[]) => void;
  getTeamLogo: (teamName: string) => string | null;
}

export function SeedingPanel({ teams, maxSeeds, onReorder, getTeamLogo }: SeedingPanelProps) {
  const displayTeams = teams.slice(0, maxSeeds);

  function moveSeed(index: number, direction: 'up' | 'down') {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= displayTeams.length) return;

    const newTeams = [...teams];
    const updated = [...displayTeams];

    // Swap positions
    [updated[index], updated[swapWith]] = [updated[swapWith], updated[index]];

    // Reassign seeds
    const reseeded = updated.map((t, i) => ({ ...t, seed: i + 1 }));

    // Replace the first maxSeeds in the full teams array
    for (let i = 0; i < reseeded.length; i++) {
      newTeams[i] = reseeded[i];
    }

    onReorder(newTeams);
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-2">
        Seeding ({displayTeams.length} of {teams.length} teams)
      </div>
      <div className="space-y-0.5 max-h-[300px] sm:max-h-[500px] overflow-y-auto">
        {displayTeams.map((team, idx) => (
          <div
            key={team.teamName}
            className="flex items-center gap-2 px-2 py-1 text-sm rounded hover:bg-gray-50 group"
          >
            <span className="w-5 text-xs text-gray-400 text-right flex-shrink-0">{team.seed}</span>
            <div className="flex gap-0.5 flex-shrink-0">
              <button
                onClick={() => moveSeed(idx, 'up')}
                disabled={idx === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs p-1.5 -m-1"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => moveSeed(idx, 'down')}
                disabled={idx === displayTeams.length - 1}
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
            <span className="truncate flex-1 min-w-0 text-gray-900">{team.teamName}</span>
            <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{formatRating(team.rating)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
