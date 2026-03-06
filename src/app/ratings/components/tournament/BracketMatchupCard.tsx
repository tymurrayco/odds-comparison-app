'use client';

import React from 'react';
import { TeamLogo } from '../TeamLogo';
import { formatSpread, formatWinProb } from '../../utils/tournamentProjection';
import type { BracketMatchup } from '../../types/tournament';

interface BracketMatchupCardProps {
  matchup: BracketMatchup;
  onPickWinner: (matchupId: string, side: 'top' | 'bottom') => void;
  onToggleCompleted: (matchupId: string) => void;
  getTeamLogo: (teamName: string) => string | null;
}

function TeamRow({
  team,
  side,
  matchup,
  isCompleted,
  onClick,
  onToggleCompleted,
  getTeamLogo,
}: {
  team: { teamName: string; seed: number; rating: number; logoUrl: string | null } | null;
  side: 'top' | 'bottom';
  matchup: BracketMatchup;
  isCompleted?: boolean;
  onClick: () => void;
  onToggleCompleted: () => void;
  getTeamLogo: (teamName: string) => string | null;
}) {
  if (!team) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-gray-400 text-xs h-8">
        <span className="w-4 text-center">—</span>
        <span className="italic">TBD</span>
      </div>
    );
  }

  const isWinner = matchup.winner === side;
  const isLoser = matchup.winner !== null && matchup.winner !== side;

  return (
    <div className="flex items-center h-8">
      <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-2 py-1.5 flex-1 min-w-0 text-left text-xs h-full transition-colors ${
          isWinner
            ? 'bg-green-50 font-semibold text-gray-900'
            : isLoser
              ? 'text-gray-400'
              : 'text-gray-700 hover:bg-gray-50'
        }`}
      >
        <span className="w-4 text-center text-[10px] text-gray-400 flex-shrink-0">{team.seed}</span>
        <TeamLogo
          teamName={team.teamName}
          logoUrl={getTeamLogo(team.teamName)}
          size="sm"
        />
        <span className="truncate flex-1 min-w-0">{team.teamName}</span>
      </button>
      {isWinner && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCompleted(); }}
          className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors mr-1.5 ${
            isCompleted
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-gray-300 text-transparent hover:border-green-400 hover:text-green-400'
          }`}
          title={isCompleted ? 'Mark as pending' : 'Mark as final result'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

export function BracketMatchupCard({ matchup, onPickWinner, onToggleCompleted, getTeamLogo }: BracketMatchupCardProps) {
  const hasTeams = matchup.topTeam && matchup.bottomTeam;
  const isCompleted = matchup.isCompleted;

  // Spread display
  let spreadText: string | null = null;
  if (matchup.projectedSpread !== null && matchup.topTeam && matchup.bottomTeam) {
    const spread = matchup.projectedSpread;
    if (spread <= 0) {
      spreadText = `${matchup.topTeam.teamName} ${formatSpread(spread)}`;
    } else {
      spreadText = `${matchup.bottomTeam.teamName} ${formatSpread(-spread)}`;
    }
  }

  // Win prob for the bar
  const topProb = matchup.winProbTop;

  return (
    <div
      className={`w-40 sm:w-48 rounded border bg-white shadow-sm relative ${
        isCompleted
          ? 'border-green-500 ring-1 ring-green-200'
          : matchup.isManualOverride
            ? 'border-yellow-400 ring-1 ring-yellow-200'
            : 'border-gray-200'
      }`}
    >
      {/* Top team */}
      <TeamRow
        team={matchup.topTeam}
        side="top"
        matchup={matchup}
        isCompleted={isCompleted}
        onClick={() => hasTeams && onPickWinner(matchup.id, 'top')}
        onToggleCompleted={() => onToggleCompleted(matchup.id)}
        getTeamLogo={getTeamLogo}
      />

      {/* Divider with spread info */}
      <div className="border-t border-gray-100 px-2 py-0.5 flex items-center gap-1">
        {topProb !== null && (
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-400 rounded-full transition-all"
              style={{ width: `${Math.round(topProb * 100)}%` }}
            />
          </div>
        )}
        {spreadText && (
          <span className="text-[9px] text-gray-500 whitespace-nowrap flex-shrink-0">
            {spreadText}
          </span>
        )}
      </div>

      {/* Bottom team */}
      <TeamRow
        team={matchup.bottomTeam}
        side="bottom"
        matchup={matchup}
        isCompleted={isCompleted}
        onClick={() => hasTeams && onPickWinner(matchup.id, 'bottom')}
        onToggleCompleted={() => onToggleCompleted(matchup.id)}
        getTeamLogo={getTeamLogo}
      />

      {/* Win probability footer */}
      {topProb !== null && (
        <div className="border-t border-gray-100 px-2 py-0.5 flex justify-between text-[9px] text-gray-400">
          <span>{formatWinProb(topProb)}</span>
          <span>{formatWinProb(1 - topProb)}</span>
        </div>
      )}
    </div>
  );
}
