// src/components/PowersMatchup.tsx
//
// Brad Powers matchup view: preseason Vegas power ratings + per-team
// homefield advantage, projecting a point spread for this game.

import { useEffect, useState } from 'react';
import { PowerRatingRow } from '@/lib/powerRatings';

interface PowersMatchupProps {
  awayTeam: string; // odds-api names
  homeTeam: string;
  isNeutralSite?: boolean;
}

interface MatchupSide {
  requested: string;
  row: PowerRatingRow | null;
}

interface PowersResponse {
  success?: boolean;
  error?: string;
  sourceLabel?: string;
  season?: number;
  asOf?: string | null;
  away?: MatchupSide;
  home?: MatchupSide;
  hfaUsed?: number | null;
  neutralSpread?: number | null;
  homeSpread?: number | null;
}

const logoPath = (oddsName: string) =>
  `/team-logos/${oddsName.toLowerCase().replace(/\s+/g, '')}.png`;

const spread = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));

function SideColumn({ side }: { side: MatchupSide }) {
  const r = side.row;
  if (!r) {
    return (
      <div className="text-center text-sm text-gray-500">
        <p className="font-semibold">{side.requested}</p>
        <p className="mt-2 italic">Not in Powers&rsquo; ratings (likely non-FBS)</p>
      </div>
    );
  }
  return (
    <div className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoPath(side.requested)}
        alt={side.requested}
        className="h-12 w-12 md:h-14 md:w-14 mx-auto mb-1"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
      <h3 className="font-semibold text-sm md:text-base">{r.team}</h3>
      <p className="text-xs text-gray-600">#{r.rank}</p>
      <p className="text-2xl font-bold mt-1 text-purple-700">{r.thisYr.toFixed(2)}</p>
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

export default function PowersMatchup({ awayTeam, homeTeam, isNeutralSite = false }: PowersMatchupProps) {
  const [data, setData] = useState<PowersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/power-ratings?teams=${encodeURIComponent(awayTeam)},${encodeURIComponent(homeTeam)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ error: 'Failed to load Powers ratings' }); setLoading(false); } });
    return () => { alive = false; };
  }, [awayTeam, homeTeam]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-500">Loading Powers ratings…</div>;
  }
  if (!data || data.error || !data.away || !data.home) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        {data?.error || 'Powers ratings unavailable.'}
      </div>
    );
  }

  const a = data.away.row;
  const h = data.home.row;
  const bothMatched = !!(a && h);
  // On a neutral field neither team gets its home edge.
  const homeSpread = isNeutralSite ? data.neutralSpread : data.homeSpread;

  const diffOf = (r: PowerRatingRow) =>
    r.lastYr === null ? null : Math.round((r.thisYr - r.lastYr) * 100) / 100;
  const fmtDiff = (d: number | null) => (d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(2)}`);
  const betterHigh = (av: number, hv: number): 'away' | 'home' | null =>
    av === hv ? null : av > hv ? 'away' : 'home';

  return (
    <div className="p-3 md:p-4">
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 items-center">
        <SideColumn side={data.away} />
        <div className="text-center">
          {bothMatched && homeSpread !== null && homeSpread !== undefined && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Projected line</p>
              <p className="text-lg font-bold">
                {homeSpread <= 0 ? h!.team : a!.team} {spread(homeSpread <= 0 ? homeSpread : -homeSpread)}
              </p>
              <p className="text-[10px] text-gray-400">
                {isNeutralSite ? (
                  'neutral site · no home edge'
                ) : (
                  <>
                    incl. {data.hfaUsed?.toFixed(2)} home edge
                    {data.neutralSpread !== null && data.neutralSpread !== undefined &&
                      ` · neutral ${spread(data.neutralSpread)}`}
                  </>
                )}
              </p>
            </>
          )}
        </div>
        <SideColumn side={data.home} />
      </div>

      {bothMatched && (
        <>
          <StatRow
            label="Power rating"
            away={a!.thisYr.toFixed(2)}
            home={h!.thisYr.toFixed(2)}
            better={betterHigh(a!.thisYr, h!.thisYr)}
          />
          <StatRow
            label="2025 final"
            away={a!.lastYr?.toFixed(2) ?? '—'}
            home={h!.lastYr?.toFixed(2) ?? '—'}
            better={a!.lastYr !== null && h!.lastYr !== null ? betterHigh(a!.lastYr, h!.lastYr) : null}
          />
          <StatRow
            label="Off-season change"
            away={fmtDiff(diffOf(a!))}
            home={fmtDiff(diffOf(h!))}
            better={null}
          />
          <StatRow
            label="Homefield edge"
            away={typeof a!.hfa === 'number' ? a!.hfa.toFixed(2) : '—'}
            home={typeof h!.hfa === 'number' ? h!.hfa.toFixed(2) : '—'}
            better={null}
          />
          <p className="mt-3 text-[10px] text-gray-400 text-center">
            {data.sourceLabel} {data.season} preseason Vegas power ratings · line = rating
            difference{isNeutralSite ? ' only (neutral field)' : " + home team's HFA"} (negative =
            home favored){data.asOf ? ` · as of ${data.asOf}` : ''}
          </p>
        </>
      )}
    </div>
  );
}
