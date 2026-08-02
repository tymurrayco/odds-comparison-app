// src/components/AnalysisTabs.tsx
//
// Methodology tabs for the NCAAF Analysis section: FEI (efficiency ratings
// from bcftoys), Eckel (quality-drive metrics from CFBD drive data), and
// Powers (Brad Powers' Vegas power ratings + per-team HFA spread projection).

import { useState } from 'react';
import TeamAnalysis from './TeamAnalysis';
import EckelMatchup from './EckelMatchup';
import PowersMatchup from './PowersMatchup';
import SummaryMatchup from './SummaryMatchup';

interface AnalysisTabsProps {
  awayTeam: string;
  homeTeam: string;
  isNeutralSite?: boolean;
  venue?: string | null;
}

const TABS = ['Summary', 'FEI', 'Eckel', 'Powers'] as const;
type Tab = (typeof TABS)[number];

export default function AnalysisTabs({
  awayTeam, homeTeam, isNeutralSite = false, venue = null,
}: AnalysisTabsProps) {
  const [tab, setTab] = useState<Tab>('Summary');

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 px-3 pt-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
              tab === t
                ? 'bg-purple-100 text-purple-800 border border-b-0 border-gray-200'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {isNeutralSite && (
        <p className="px-3 pt-2 text-[10px] text-gray-500">
          Neutral site{venue ? ` — ${venue}` : ''} · no home-field edge applied
        </p>
      )}
      {tab === 'Summary' ? (
        <SummaryMatchup awayTeam={awayTeam} homeTeam={homeTeam} isNeutralSite={isNeutralSite} />
      ) : tab === 'FEI' ? (
        <TeamAnalysis awayTeam={awayTeam} homeTeam={homeTeam} />
      ) : tab === 'Eckel' ? (
        <EckelMatchup awayTeam={awayTeam} homeTeam={homeTeam} isNeutralSite={isNeutralSite} />
      ) : (
        <PowersMatchup awayTeam={awayTeam} homeTeam={homeTeam} isNeutralSite={isNeutralSite} />
      )}
    </div>
  );
}
