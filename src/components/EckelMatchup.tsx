// src/components/EckelMatchup.tsx
//
// Eckel-methodology matchup view: opponent-adjusted quality-drive metrics,
// power ratings, and an expected margin for this game.

import { useEffect, useState } from 'react';
import { TeamSeasonMetrics } from '@/lib/eckel/types';

interface EckelMatchupProps {
  awayTeam: string; // odds-api names
  homeTeam: string;
  isNeutralSite?: boolean;
}

interface MatchupSide {
  requested: string;
  matched: string | null;
  confidence: string;
  metrics: TeamSeasonMetrics | null;
  rank: number | null;
}

interface EckelResponse {
  success?: boolean;
  error?: string;
  season?: number;
  week?: number | null;
  computedAt?: string;
  hfaPoints?: number;
  hfaSource?: 'powers' | 'eckel-fit';
  matchup?: MatchupSide[];
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number, d = 2) => v.toFixed(d);
const logoPath = (oddsName: string) =>
  `/team-logos/${oddsName.toLowerCase().replace(/\s+/g, '')}.png`;

function SideColumn({ side }: { side: MatchupSide }) {
  const m = side.metrics;
  if (!m) {
    return (
      <div className="text-center text-sm text-gray-500">
        <p className="font-semibold">{side.requested}</p>
        <p className="mt-2 italic">No Eckel data (likely non-FBS)</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      <img
        src={logoPath(side.requested)}
        alt={side.requested}
        className="h-12 w-12 md:h-14 md:w-14 mx-auto mb-1"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <h3 className="font-semibold text-sm md:text-base">{m.team}</h3>
      <p className="text-xs text-gray-600">#{side.rank} · {m.wins}-{m.losses}</p>
      <p className="text-2xl font-bold mt-1 text-purple-700">{num(m.powerRating, 1)}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">Power rating</p>
    </div>
  );
}

function StatRow({
  label, away, home, better,
}: { label: string; away: string; home: string; better: 'away' | 'home' | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-gray-100 text-sm items-center">
      <div className={`text-right ${better === 'away' ? 'font-bold text-green-700' : ''}`}>{away}</div>
      <div className="text-center text-xs text-gray-500">{label}</div>
      <div className={`text-left ${better === 'home' ? 'font-bold text-green-700' : ''}`}>{home}</div>
    </div>
  );
}

export default function EckelMatchup({ awayTeam, homeTeam, isNeutralSite = false }: EckelMatchupProps) {
  const [data, setData] = useState<EckelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/eckel?teams=${encodeURIComponent(awayTeam)},${encodeURIComponent(homeTeam)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ error: 'Failed to load Eckel data' }); setLoading(false); } });
    return () => { alive = false; };
  }, [awayTeam, homeTeam]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-500">Loading Eckel ratings…</div>;
  }
  if (!data || data.error || !data.matchup || data.matchup.length < 2) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        {data?.error?.includes('snapshot')
          ? 'Eckel ratings have not been computed yet for this season.'
          : data?.error || 'Eckel data unavailable.'}
      </div>
    );
  }

  const [away, home] = data.matchup;
  const a = away.metrics;
  const h = home.metrics;
  const bothMatched = !!(a && h);
  const hfa = isNeutralSite ? 0 : data.hfaPoints ?? 2.2;
  const expectedMargin = bothMatched ? h!.powerRating - a!.powerRating + hfa : null;

  const betterHigh = (av: number, hv: number): 'away' | 'home' | null =>
    av === hv ? null : av > hv ? 'away' : 'home';
  const betterLow = (av: number, hv: number): 'away' | 'home' | null =>
    av === hv ? null : av < hv ? 'away' : 'home';

  return (
    <div className="p-3 md:p-4">
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 items-center">
        <SideColumn side={away} />
        <div className="text-center">
          {expectedMargin !== null && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Projected</p>
              <p className="text-lg font-bold">
                {expectedMargin >= 0 ? h!.team : a!.team}
                {' by '}
                {Math.abs(expectedMargin).toFixed(1)}
              </p>
              <p className="text-[10px] text-gray-400">
                {isNeutralSite
                  ? 'neutral site · no HFA'
                  : `incl. ${hfa.toFixed(hfa % 1 ? 2 : 1)} HFA${data.hfaSource === 'powers' ? ' (Powers)' : ''}`}
              </p>
            </>
          )}
        </div>
        <SideColumn side={home} />
      </div>

      {bothMatched && (
        <>
          <div className="mb-1 text-center text-[10px] uppercase tracking-wide text-gray-400">
            Opponent-adjusted (raw in parens)
          </div>
          <StatRow
            label="Eckel Rate — Off"
            away={`${pct(a!.adjEckelRateOff)} (${pct(a!.eckelRateOff)})`}
            home={`${pct(h!.adjEckelRateOff)} (${pct(h!.eckelRateOff)})`}
            better={betterHigh(a!.adjEckelRateOff, h!.adjEckelRateOff)}
          />
          <StatRow
            label="Eckel Rate — Def"
            away={`${pct(a!.adjEckelRateDef)} (${pct(a!.eckelRateDef)})`}
            home={`${pct(h!.adjEckelRateDef)} (${pct(h!.eckelRateDef)})`}
            better={betterLow(a!.adjEckelRateDef, h!.adjEckelRateDef)}
          />
          <StatRow
            label="Pts / Eckel — Off"
            away={`${num(a!.adjPointsPerEckelOff)} (${num(a!.pointsPerEckelOff)})`}
            home={`${num(h!.adjPointsPerEckelOff)} (${num(h!.pointsPerEckelOff)})`}
            better={betterHigh(a!.adjPointsPerEckelOff, h!.adjPointsPerEckelOff)}
          />
          <StatRow
            label="Pts / Eckel — Def"
            away={`${num(a!.adjPointsPerEckelDef)} (${num(a!.pointsPerEckelDef)})`}
            home={`${num(h!.adjPointsPerEckelDef)} (${num(h!.pointsPerEckelDef)})`}
            better={betterLow(a!.adjPointsPerEckelDef, h!.adjPointsPerEckelDef)}
          />
          <StatRow
            label="Eckel Ratio"
            away={pct(a!.eckelRatio)}
            home={pct(h!.eckelRatio)}
            better={betterHigh(a!.eckelRatio, h!.eckelRatio)}
          />
          <StatRow
            label="xRecord (luck)"
            away={`${num(a!.xWins, 1)} xW (${a!.luckDelta >= 0 ? '+' : ''}${num(a!.luckDelta, 1)})`}
            home={`${num(h!.xWins, 1)} xW (${h!.luckDelta >= 0 ? '+' : ''}${num(h!.luckDelta, 1)})`}
            better={null}
          />
          <p className="mt-3 text-[10px] text-gray-400 text-center">
            Quality-drive (&ldquo;Eckel&rdquo;) metrics after Parker Fleming · drives reaching the opp 40 or
            scoring a TD, garbage time excluded, ridge-adjusted for opponent strength ·{' '}
            {data.season} season{data.week ? ` through week ${data.week}` : ''} · luck = actual wins − xWins
          </p>
        </>
      )}
    </div>
  );
}
