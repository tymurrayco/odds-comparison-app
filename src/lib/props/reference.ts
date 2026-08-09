// src/lib/props/reference.ts
// Derive the SD-multiplier reference table from game logs, and compute
// per-player measured stats. Multiplier = median of (per-season SD / mean)
// across qualifying player-seasons — the "0.56 for rushing yards" number.

import { mean, median, stdDev } from './engine';
import { PROP_MARKETS, PlayerGameLog, PropMarketDef } from './markets';

export interface TierRef {
  label: string;          // e.g. "< 60", "60–80", "80+"
  min: number;
  max: number | null;
  multiplier: number | null; // median CV, null when no qualifying seasons
  n: number;              // qualifying player-seasons in the tier
}

export interface PositionRef {
  overall: { multiplier: number | null; n: number };
  tiers: TierRef[];
  meanAboveMedianPct: number | null; // share of seasons where mean > median (skew evidence)
}

export interface PropReference {
  seasons: number[];
  computedAt: string;
  markets: { [marketKey: string]: { [position: string]: PositionRef } };
}

interface SeasonAgg {
  cv: number;
  statMean: number;
  skewed: boolean; // mean > median
}

/** Group REG-season logs into per-(player, season) stat arrays and aggregate. */
function qualifyingSeasons(logs: PlayerGameLog[], def: PropMarketDef, position: string): SeasonAgg[] {
  const byPlayerSeason = new Map<string, PlayerGameLog[]>();
  for (const g of logs) {
    if (g.position !== position || g.season_type !== 'REG') continue;
    const k = `${g.player_id}|${g.season}`;
    const arr = byPlayerSeason.get(k);
    if (arr) arr.push(g);
    else byPlayerSeason.set(k, [g]);
  }

  const out: SeasonAgg[] = [];
  for (const games of byPlayerSeason.values()) {
    if (games.length < 8) continue; // needs a real sample
    const opps = games.map((g) => g[def.opportunityStat] ?? 0);
    if (mean(opps) < def.qualifyMin) continue; // needs a real role
    const stats = games.map((g) => g[def.stat] ?? 0);
    const m = mean(stats);
    const sd = stdDev(stats);
    if (!(m > 0) || !Number.isFinite(sd)) continue;
    out.push({ cv: sd / m, statMean: m, skewed: m > median(stats) });
  }
  return out;
}

function tierLabel(min: number, max: number | null): string {
  if (min === 0) return `< ${max}`;
  if (max === null) return `${min}+`;
  return `${min}–${max}`;
}

/** Compute the full reference table from raw logs (REG games only). */
export function computeReference(logs: PlayerGameLog[], seasons: number[]): PropReference {
  const markets: PropReference['markets'] = {};

  for (const def of PROP_MARKETS) {
    markets[def.key] = {};
    for (const pos of def.positions) {
      const aggs = qualifyingSeasons(logs, def, pos);
      const edges = [0, ...def.tierBounds, null] as (number | null)[];
      const tiers: TierRef[] = [];
      for (let i = 0; i < edges.length - 1; i++) {
        const min = edges[i] as number;
        const max = edges[i + 1];
        const inTier = aggs.filter((a) => a.statMean >= min && (max === null || a.statMean < max));
        tiers.push({
          label: tierLabel(min, max),
          min,
          max,
          multiplier: inTier.length ? round3(median(inTier.map((a) => a.cv))) : null,
          n: inTier.length,
        });
      }
      markets[def.key][pos] = {
        overall: {
          multiplier: aggs.length ? round3(median(aggs.map((a) => a.cv))) : null,
          n: aggs.length,
        },
        tiers,
        meanAboveMedianPct: aggs.length
          ? Math.round((aggs.filter((a) => a.skewed).length / aggs.length) * 100)
          : null,
      };
    }
  }

  return { seasons, computedAt: new Date().toISOString(), markets };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

// ---------- per-player measured stats ----------

export interface MeasuredStats {
  games: number;
  mean: number;
  median: number;
  sd: number;
  cv: number;               // sd / mean — compare against the league multiplier
  oppMean: number;          // per-game opportunities (carries / targets / attempts)
  values: number[];         // the per-game stat values used (chronological)
}

/**
 * Measure a player's distribution for one market from selected game logs.
 * minOpportunities excludes games below a volume floor (injury exits, week 18
 * rest games); 0 keeps everything.
 */
export function measurePlayer(
  games: PlayerGameLog[],
  def: PropMarketDef,
  opts: { seasons?: number[]; includePost?: boolean; minOpportunities?: number } = {}
): MeasuredStats | null {
  const minOpp = opts.minOpportunities ?? 0;
  const filtered = games
    .filter((g) => (opts.seasons ? opts.seasons.includes(g.season) : true))
    .filter((g) => (opts.includePost ? true : g.season_type === 'REG'))
    .filter((g) => (g[def.opportunityStat] ?? 0) >= minOpp)
    .sort((a, b) => a.season - b.season || a.week - b.week);

  if (filtered.length < 2) return null;
  const values = filtered.map((g) => g[def.stat] ?? 0);
  const m = mean(values);
  const sd = stdDev(values);
  return {
    games: filtered.length,
    mean: m,
    median: median(values),
    sd,
    cv: m > 0 ? sd / m : NaN,
    oppMean: mean(filtered.map((g) => g[def.opportunityStat] ?? 0)),
    values,
  };
}
