// src/components/SummaryMatchup.tsx
//
// At-a-glance comparison: FEI, Eckel, and Powers projected lines for one
// game in a single table, plus the average across available systems.

import { useEffect, useState } from 'react';
import { fetchFEIData, getTeamFEIData, calculateExpectedScore } from '@/lib/feiData';
import { TeamSeasonMetrics } from '@/lib/eckel/types';
import { PowerRatingRow } from '@/lib/powerRatings';

interface SummaryMatchupProps {
  awayTeam: string; // odds-api names
  homeTeam: string;
}

interface SystemRow {
  system: string;
  awayLabel: string | null; // rating (#rank), null = team not covered
  homeLabel: string | null;
  homeLine: number | null; // negative = home favored
  note?: string;
}

const logoPath = (oddsName: string) =>
  `/team-logos/${oddsName.toLowerCase().replace(/\s+/g, '')}.png`;

const round1 = (v: number) => Math.round(v * 10) / 10;

function TeamLogo({ oddsName, className }: { oddsName: string; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoPath(oddsName)}
      alt={oddsName}
      className={className}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

export default function SummaryMatchup({ awayTeam, homeTeam }: SummaryMatchupProps) {
  const [rows, setRows] = useState<SystemRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    const feiPromise = fetchFEIData().then((data) => {
      const away = getTeamFEIData(awayTeam, data);
      const home = getTeamFEIData(homeTeam, data);
      const line = away && home ? -calculateExpectedScore(away, home).spread : null;
      return {
        system: 'FEI',
        awayLabel: away ? `${away.fei.toFixed(2)} (#${away.rank})` : null,
        homeLabel: home ? `${home.fei.toFixed(2)} (#${home.rank})` : null,
        homeLine: line === null ? null : round1(line),
        note: 'score projection',
      } as SystemRow;
    });

    const eckelPromise = fetch(
      `/api/eckel?teams=${encodeURIComponent(awayTeam)},${encodeURIComponent(homeTeam)}`
    )
      .then((r) => r.json())
      .then((d) => {
        const a: TeamSeasonMetrics | null = d.matchup?.[0]?.metrics ?? null;
        const h: TeamSeasonMetrics | null = d.matchup?.[1]?.metrics ?? null;
        const hfa: number = d.hfaPoints ?? 2.5;
        const line = a && h ? -(h.powerRating - a.powerRating + hfa) : null;
        return {
          system: 'Eckel',
          awayLabel: a ? `${a.powerRating.toFixed(1)} (#${d.matchup[0].rank})` : null,
          homeLabel: h ? `${h.powerRating.toFixed(1)} (#${d.matchup[1].rank})` : null,
          homeLine: line === null ? null : round1(line),
          note: d.hfaSource === 'powers' ? 'Powers HFA' : 'fitted HFA',
        } as SystemRow;
      });

    const powersPromise = fetch(
      `/api/power-ratings?teams=${encodeURIComponent(awayTeam)},${encodeURIComponent(homeTeam)}`
    )
      .then((r) => r.json())
      .then((d) => {
        const a: PowerRatingRow | null = d.away?.row ?? null;
        const h: PowerRatingRow | null = d.home?.row ?? null;
        return {
          system: 'Powers',
          awayLabel: a ? `${a.thisYr.toFixed(1)} (#${a.rank})` : null,
          homeLabel: h ? `${h.thisYr.toFixed(1)} (#${h.rank})` : null,
          homeLine: typeof d.homeSpread === 'number' ? d.homeSpread : null,
          note: 'per-team HFA',
        } as SystemRow;
      });

    Promise.allSettled([feiPromise, eckelPromise, powersPromise]).then((results) => {
      if (!alive) return;
      setRows(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? r.value
            : { system: ['FEI', 'Eckel', 'Powers'][i], awayLabel: null, homeLabel: null, homeLine: null }
        )
      );
      setLoading(false);
    });

    return () => { alive = false; };
  }, [awayTeam, homeTeam]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-500">Loading projections…</div>;
  }
  if (!rows) return null;

  const lines = rows.map((r) => r.homeLine).filter((l): l is number => l !== null);
  const avgLine = lines.length ? round1(lines.reduce((s, l) => s + l, 0) / lines.length) : null;

  const LineCell = ({ line }: { line: number | null }) => {
    if (line === null) return <span className="text-gray-400">—</span>;
    const favOdds = line <= 0 ? homeTeam : awayTeam;
    return (
      <span className="inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums">
        <TeamLogo oddsName={favOdds} className="w-4 h-4 object-contain" />
        {(line <= 0 ? line : -line).toFixed(1)}
      </span>
    );
  };

  return (
    <div className="p-3 md:p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
            <th className="py-2 text-left font-semibold">System</th>
            <th className="py-2 text-center">
              <span className="inline-flex flex-col items-center gap-0.5">
                <TeamLogo oddsName={awayTeam} className="w-7 h-7 md:w-8 md:h-8 object-contain" />
                Away
              </span>
            </th>
            <th className="py-2 text-center">
              <span className="inline-flex flex-col items-center gap-0.5">
                <TeamLogo oddsName={homeTeam} className="w-7 h-7 md:w-8 md:h-8 object-contain" />
                Home
              </span>
            </th>
            <th className="py-2 text-right">Line</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const awayFav = r.homeLine !== null && r.homeLine > 0;
            const homeFav = r.homeLine !== null && r.homeLine < 0;
            return (
              <tr key={r.system} className="border-b border-gray-100">
                <td className="py-2.5 font-medium text-gray-800">
                  {r.system}
                  {r.note && <span className="block text-[10px] text-gray-400 font-normal">{r.note}</span>}
                </td>
                <td className={`py-2.5 text-center tabular-nums ${awayFav ? 'font-bold text-green-700' : 'text-gray-700'}`}>
                  {r.awayLabel ?? <span className="text-gray-400">—</span>}
                </td>
                <td className={`py-2.5 text-center tabular-nums ${homeFav ? 'font-bold text-green-700' : 'text-gray-700'}`}>
                  {r.homeLabel ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="py-2.5 text-right"><LineCell line={r.homeLine} /></td>
              </tr>
            );
          })}
          {avgLine !== null && (
            <tr className="bg-gray-50">
              <td className="py-2.5 font-semibold text-gray-900">
                Average
                <span className="block text-[10px] text-gray-400 font-normal">{lines.length} of 3 systems</span>
              </td>
              <td />
              <td />
              <td className="py-2.5 text-right"><LineCell line={avgLine} /></td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-[10px] text-gray-400 text-center">
        Line shown for the favorite (logo) · FEI = expected-score projection incl. home edge ·
        Eckel & Powers = rating difference + Brad Powers&rsquo; per-team home HFA · ratings shown as value (#rank)
      </p>
    </div>
  );
}
