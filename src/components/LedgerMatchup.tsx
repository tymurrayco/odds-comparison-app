// src/components/LedgerMatchup.tsx
//
// "Ledger" tab (odds.day's own system): the market-driven power ratings (a
// preseason seed — Brad Powers for FBS, Massey for FCS, the market-implied
// fit for the NFL — then moved only by closing lines) projecting a spread
// for this game. Same numbers as the Upcoming tab on the ratings pages.

import { useEffect, useState } from 'react';
import { cachedJson } from '@/lib/matchupCache';
import type { MatchupSide } from '@/lib/fbs/matchupTypes';

export type LedgerLeague = 'ncaaf' | 'nfl';

interface LedgerMatchupProps {
  awayTeam: string; // odds-api names
  homeTeam: string;
  isNeutralSite?: boolean;
  league?: LedgerLeague;
}

interface LedgerResponse {
  success?: boolean;
  error?: string;
  system?: 'fbs' | 'fcs' | 'cross' | 'nfl' | null;
  season?: number;
  isNeutralSite?: boolean;
  away?: MatchupSide;
  home?: MatchupSide;
  hfaApplied?: number | null;
  homeSpread?: number | null;
  neutralSpread?: number | null;
  scaleOffset?: number | null;
  scaleOffsetSource?: string | null;
  seedLabel?: string | null;
  totals?: {
    projected: number; fundTotal: number; plays: number;
    homePts: number; awayPts: number; homeTerm: number; awayTerm: number;
    homePace: number; awayPace: number;
  } | null;
  updatedAt?: string | null;
}

export const ledgerMatchupUrl = (
  awayTeam: string,
  homeTeam: string,
  isNeutralSite: boolean,
  league: LedgerLeague = 'ncaaf'
) =>
  `/api/${league === 'nfl' ? 'nfl' : 'fbs'}/matchup?teams=${encodeURIComponent(awayTeam)},${encodeURIComponent(homeTeam)}` +
  (isNeutralSite ? '&neutral=1' : '');

const localLogo = (oddsName: string) =>
  `/team-logos/${oddsName.toLowerCase().replace(/\s+/g, '')}.png`;

const spread = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1));
const signed = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));

function SideColumn({ side, cross }: { side: MatchupSide; cross: boolean }) {
  if (!side.matched) {
    return (
      <div className="text-center text-sm text-gray-500">
        <p className="font-semibold">{side.requested}</p>
        <p className="mt-2 italic">Not in the Ledger ratings</p>
      </div>
    );
  }
  const espnLogo =
    side.logo ??
    (side.espnId && side.division !== 'nfl'
      ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${side.espnId}.png`
      : null);
  return (
    <div className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={espnLogo ?? localLogo(side.requested)}
        alt={side.requested}
        className="h-12 w-12 md:h-14 md:w-14 mx-auto mb-1 object-contain"
        onError={(e) => {
          const img = e.currentTarget;
          if (espnLogo && img.src !== localLogo(side.requested)) img.src = localLogo(side.requested);
          else img.style.display = 'none';
        }}
      />
      <h3 className="font-semibold text-sm md:text-base">{side.teamName}</h3>
      <p className="text-xs text-gray-600">
        #{side.rank} of {side.of} {side.division?.toUpperCase()}
      </p>
      <p className="text-2xl font-bold mt-1 text-purple-700">
        {(cross && side.division === 'fcs' ? side.ratingOnScale : side.rating)?.toFixed(2)}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">
        {cross && side.division === 'fcs' ? 'Rating (FBS scale)' : 'Rating'}
      </p>
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

export default function LedgerMatchup({
  awayTeam, homeTeam, isNeutralSite = false, league = 'ncaaf',
}: LedgerMatchupProps) {
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    cachedJson<LedgerResponse>(ledgerMatchupUrl(awayTeam, homeTeam, isNeutralSite, league))
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData({ error: 'Failed to load Ledger ratings' }); setLoading(false); } });
    return () => { alive = false; };
  }, [awayTeam, homeTeam, isNeutralSite, league]);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-500">Loading Ledger ratings…</div>;
  }
  if (!data || data.error || !data.away || !data.home) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        {data?.error || 'Ledger ratings unavailable.'}
      </div>
    );
  }

  const a = data.away;
  const h = data.home;
  const both = a.matched && h.matched;
  const cross = data.system === 'cross';
  // The NFL route knows the season's neutral games itself (international
  // slate, Super Bowl); the NCAAF card passes its own neutral-site lookup.
  const neutral = data.isNeutralSite ?? isNeutralSite;
  const homeSpread = neutral ? data.neutralSpread : data.homeSpread;
  const betterHigh = (av: number | null, hv: number | null): 'away' | 'home' | null =>
    av === null || hv === null || av === hv ? null : av > hv ? 'away' : 'home';

  return (
    <div className="p-3 md:p-4">
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 items-center">
        <SideColumn side={a} cross={cross} />
        <div className="text-center">
          {both && homeSpread !== null && homeSpread !== undefined && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Projected line</p>
              <p className="text-lg font-bold">
                {homeSpread <= 0 ? h.teamName : a.teamName} {spread(homeSpread <= 0 ? homeSpread : -homeSpread)}
              </p>
              <p className="text-[10px] text-gray-400">
                {neutral ? (
                  'neutral site · no home edge'
                ) : (
                  <>
                    incl. {data.hfaApplied?.toFixed(2)} home edge
                    {data.neutralSpread !== null && data.neutralSpread !== undefined &&
                      ` · neutral ${spread(data.neutralSpread)}`}
                  </>
                )}
              </p>
            </>
          )}
          {both && data.totals && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">Projected total</p>
              <p className="text-base font-bold tabular-nums">{data.totals.projected.toFixed(1)}</p>
              <p className="text-[10px] text-gray-400 tabular-nums">
                {data.totals.plays.toFixed(0)} plays · {a.teamName?.split(' ').pop()} {data.totals.awayPts.toFixed(1)} · {h.teamName?.split(' ').pop()} {data.totals.homePts.toFixed(1)}
                {' · market '}{(data.totals.homeTerm + data.totals.awayTerm) >= 0 ? '+' : ''}{(data.totals.homeTerm + data.totals.awayTerm).toFixed(1)}
              </p>
            </div>
          )}
        </div>
        <SideColumn side={h} cross={cross} />
      </div>

      {both && (
        <>
          <StatRow
            label="Current rating"
            away={a.ratingOnScale?.toFixed(2) ?? '—'}
            home={h.ratingOnScale?.toFixed(2) ?? '—'}
            better={betterHigh(a.ratingOnScale, h.ratingOnScale)}
          />
          <StatRow
            label="Preseason seed"
            away={a.seedRating?.toFixed(2) ?? '—'}
            home={h.seedRating?.toFixed(2) ?? '—'}
            better={betterHigh(a.seedRating, h.seedRating)}
          />
          <StatRow
            label="Closing-line adjustment"
            away={a.delta === null ? '—' : signed(a.delta)}
            home={h.delta === null ? '—' : signed(h.delta)}
            better={betterHigh(a.delta, h.delta)}
          />
          <StatRow
            label="Games priced"
            away={a.gamesProcessed?.toString() ?? '—'}
            home={h.gamesProcessed?.toString() ?? '—'}
            better={null}
          />
          <StatRow
            label="Homefield edge"
            away={typeof a.hfa === 'number' ? a.hfa.toFixed(2) : data.system === 'nfl' && typeof data.hfaApplied === 'number' && !neutral ? data.hfaApplied.toFixed(2) : '—'}
            home={typeof h.hfa === 'number' ? h.hfa.toFixed(2) : data.system === 'nfl' && typeof data.hfaApplied === 'number' && !neutral ? data.hfaApplied.toFixed(2) : '—'}
            better={null}
          />
          <p className="mt-3 text-[10px] text-gray-400 text-center">
            {data.seedLabel ?? `Brad Powers ${data.season} preseason seed`}, moved only by closing lines (half the
            model-vs-close miss per game) · line = rating difference
            {neutral ? ' only (neutral field)' : " + home team's HFA"} (negative = home favored)
            {cross && data.scaleOffset !== null && data.scaleOffset !== undefined &&
              ` · FCS rating bridged +${data.scaleOffset.toFixed(1)} to the FBS scale (fallback bridge — the /fbs Upcoming tab calibrates it from the week's lined cross games)`}
            {data.updatedAt ? ` · ratings as of ${data.updatedAt.substring(0, 10)}` : ''}
          </p>
        </>
      )}
    </div>
  );
}
