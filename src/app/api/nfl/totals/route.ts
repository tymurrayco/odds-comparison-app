// src/app/api/nfl/totals/route.ts

/**
 * NFL totals Ledger.
 *
 * GET  → teams with current blended fundamentals + market terms, config,
 *        full adjustment ledger (newest first).
 * POST { action }
 *   'seed'        build priors from last season's box scores, league
 *                 averages, and fit market terms to the posted totals.
 *                 { forceRefresh } resets existing teams' terms to the fit;
 *                 otherwise existing teams keep their terms (priors refresh).
 *   'sync'        price every game already in the SPREAD ledger that the
 *                 totals ledger hasn't seen: closing total from the line
 *                 cache, else one historical Odds API snapshot at kickoff−5.
 *   'recalculate' reset every term to its seed and replay the ledger, with
 *                 fundamentals recomputed as of each game's date.
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadSeasonStats } from '@/lib/football/boxScores';
import {
  NFL_CLOSING_TIME_MINUTES,
  NFL_CONSENSUS_BOOKS,
  NFL_SEASON,
  NFL_SPORT_KEY,
  ODDS_API_BASE_URL,
} from '@/lib/nfl/constants';
import { loadNflAdjustments, loadNflRatings } from '@/lib/nfl/supabase';
import { fetchEspnNflTeams } from '@/lib/nfl/marketFit';
import { matchOddsEvent } from '@/lib/nfl/teamNames';
import {
  fitMarketTerms,
  leagueAverages,
  projectTotal,
  rawTeamStats,
  regressPrior,
  TeamPrior,
  totalsAdjustment,
} from '@/lib/nfl/totals/model';
import {
  extractConsensusTotal,
  fetchSeasonTotals,
  fundamentalsFor,
  loadTotalsSnapshot,
  TotalsSnapshot,
} from '@/lib/nfl/totals/service';
import {
  getCachedClosingTotal,
  loadTotalsAdjustments,
  saveTotalsAdjustment,
  saveTotalsConfig,
  setCachedClosingTotal,
  TotalsAdjustment,
  TotalsTeam,
  upsertTotalsTeams,
} from '@/lib/nfl/totals/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;

// ---------- seed ----------

async function handleSeed(body: { season?: number; forceRefresh?: boolean }) {
  const season = body.season ?? NFL_SEASON;
  const snap = await loadTotalsSnapshot(season);
  const [priorRows, spreadTeams, espnTeams] = await Promise.all([
    loadSeasonStats('nfl', season - 1),
    loadNflRatings(season),
    fetchEspnNflTeams(),
  ]);
  if (priorRows.length === 0) {
    throw new Error(`No ${season - 1} box scores stored — run Sync Box Scores for ${season - 1} first`);
  }
  const lg = leagueAverages(priorRows);
  if (!lg) throw new Error('League averages unavailable');
  const config = {
    ...snap.config,
    season,
    leagueAvgPace: round(lg.pace, 2),
    leagueAvgPpp: round(lg.ppp, 4),
  };

  // Priors per team (keyed by the spread Ledger's canonical team_name)
  const priors = new Map<string, TeamPrior>();
  const meta = new Map<string, { espnId: string | null; espnAbbr: string | null }>();
  for (const t of spreadTeams.values()) {
    const raw = t.espnId ? rawTeamStats(priorRows, t.espnId) : null;
    priors.set(t.teamName, regressPrior(raw, { pace: config.leagueAvgPace, ppp: config.leagueAvgPpp }, config.priorRegress));
    meta.set(t.teamName, { espnId: t.espnId, espnAbbr: t.espnAbbr });
  }
  if (priors.size === 0) throw new Error('nfl_ratings is empty — seed the spread Ledger first');

  // Market terms vs the posted totals (fundamentals = priors, no season games yet)
  const lines = await fetchSeasonTotals(espnTeams);
  const fit = fitMarketTerms(lines, priors, config.leagueAvgPpp);

  const now = new Date().toISOString();
  const upserts: TotalsTeam[] = [];
  let inserted = 0;
  let refreshed = 0;
  let reseeded = 0;
  for (const [teamName, prior] of priors) {
    const term = fit.terms.get(teamName) ?? 0;
    const existing = snap.teams.get(teamName);
    const m = meta.get(teamName)!;
    if (!existing) {
      inserted++;
      upserts.push({
        teamName, espnId: m.espnId, espnAbbr: m.espnAbbr, season,
        priorPace: prior.pace, priorOffPpp: prior.offPpp, priorDefPpp: prior.defPpp,
        marketTerm: term, initialMarketTerm: term, gamesProcessed: 0, updatedAt: now,
      });
    } else if (body.forceRefresh) {
      reseeded++;
      upserts.push({
        ...existing, espnId: m.espnId, espnAbbr: m.espnAbbr,
        priorPace: prior.pace, priorOffPpp: prior.offPpp, priorDefPpp: prior.defPpp,
        marketTerm: term, initialMarketTerm: term, gamesProcessed: 0, updatedAt: now,
      });
    } else {
      refreshed++;
      upserts.push({
        ...existing, espnId: m.espnId, espnAbbr: m.espnAbbr,
        priorPace: prior.pace, priorOffPpp: prior.offPpp, priorDefPpp: prior.defPpp, updatedAt: now,
      });
    }
  }
  await upsertTotalsTeams(upserts);
  config.seedLabel =
    `Priors: ${season - 1} box scores (${priorRows.length / 2} games) regressed ${Math.round(config.priorRegress * 100)}%; ` +
    `market terms fit to ${fit.games} posted totals, RMSE ${round(fit.rmse, 2)}`;
  await saveTotalsConfig(config);

  const unlined = [...priors.keys()].filter((t) => !fit.terms.has(t));
  return {
    success: true,
    action: 'seed',
    season,
    leagueAvg: { pace: config.leagueAvgPace, ppp: config.leagueAvgPpp },
    fit: { games: fit.games, rmse: round(fit.rmse, 2) },
    inserted, refreshed, reseeded,
    unlinedTeams: unlined,
    summary:
      `Totals seed: ${priors.size} teams (${inserted} new, ${reseeded} reset, ${refreshed} priors refreshed). ` +
      `League avg ${config.leagueAvgPace} plays, ${config.leagueAvgPpp} pts/play. ` +
      `Market terms fit to ${fit.games} posted totals (RMSE ${round(fit.rmse, 2)}).` +
      (unlined.length ? ` No posted totals for: ${unlined.join(', ')} (term 0).` : ''),
  };
}

// ---------- closing totals ----------

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{ key: string; markets?: Array<{ key: string; outcomes?: Array<{ name: string; point?: number }> }> }>;
}

async function fetchTotalsSnapshot(freezeIso: string, cache: Map<string, OddsEvent[]>): Promise<OddsEvent[]> {
  const key = freezeIso.substring(0, 16);
  const hit = cache.get(key);
  if (hit) return hit;
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/historical/sports/${NFL_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=totals&oddsFormat=american` +
    `&date=${encodeURIComponent(freezeIso)}&bookmakers=${NFL_CONSENSUS_BOOKS.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API historical HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const events: OddsEvent[] = json?.data ?? [];
  cache.set(key, events);
  return events;
}

// ---------- process one game ----------

function priceGame(
  snap: TotalsSnapshot,
  g: { gameId: string; oddsApiId: string | null; gameDate: string; homeTeam: string; awayTeam: string; isNeutralSite: boolean },
  closingTotal: number,
  closingSource: string,
  season: number
): TotalsAdjustment | null {
  const h = snap.teams.get(g.homeTeam);
  const a = snap.teams.get(g.awayTeam);
  if (!h || !a) return null;
  const home = fundamentalsFor(h, snap, g.gameDate);
  const away = fundamentalsFor(a, snap, g.gameDate);
  const p = projectTotal(home, away, h.marketTerm, a.marketTerm, snap.config.leagueAvgPpp);
  const { difference, adjustment } = totalsAdjustment(closingTotal, p.projected);
  const adj: TotalsAdjustment = {
    gameId: g.gameId, oddsApiId: g.oddsApiId, gameDate: g.gameDate,
    homeTeam: g.homeTeam, awayTeam: g.awayTeam, isNeutralSite: g.isNeutralSite,
    homePace: home.pace, homeOffPpp: home.offPpp, homeDefPpp: home.defPpp, homeStatGames: home.games,
    awayPace: away.pace, awayOffPpp: away.offPpp, awayDefPpp: away.defPpp, awayStatGames: away.games,
    playsExpected: p.plays, homePtsFund: p.homePts, awayPtsFund: p.awayPts, fundTotal: p.fundTotal,
    homeTermBefore: h.marketTerm, awayTermBefore: a.marketTerm,
    projectedTotal: p.projected, closingTotal, closingSource, difference, adjustment,
    homeTermAfter: round(h.marketTerm + adjustment, 2), awayTermAfter: round(a.marketTerm + adjustment, 2),
    season,
  };
  const now = new Date().toISOString();
  h.marketTerm = adj.homeTermAfter; h.gamesProcessed += 1; h.updatedAt = now;
  a.marketTerm = adj.awayTermAfter; a.gamesProcessed += 1; a.updatedAt = now;
  return adj;
}

// ---------- sync ----------

async function handleSync(body: { season?: number }) {
  const snap = await loadTotalsSnapshot(body.season);
  const season = body.season ?? snap.config.season;
  if (snap.teams.size === 0) throw new Error('Totals not seeded — run Seed Totals first');
  const [spreadLedger, totalsLedger] = await Promise.all([loadNflAdjustments(season), loadTotalsAdjustments(season)]);
  const done = new Set(totalsLedger.map((t) => t.gameId));
  const pending = spreadLedger.filter((g) => !done.has(g.gameId)).sort((x, y) => x.gameDate.localeCompare(y.gameDate));
  const maxLedgerDate = totalsLedger.length ? totalsLedger[totalsLedger.length - 1].gameDate : null;

  const cache = new Map<string, OddsEvent[]>();
  const processed: Array<{ game: string; date: string; projected: number; closing: number; adjustment: number }> = [];
  const skipped: Array<{ game: string; date: string; reason: string }> = [];
  let oddsApiCalls = 0;
  let needsReplay = false;

  for (const g of pending) {
    const label = `${g.awayTeam} @ ${g.homeTeam}`;
    const day = g.gameDate.substring(0, 10);
    let closingTotal: number | null = null;
    let source = 'US Avg';
    const cached = await getCachedClosingTotal(g.gameId);
    if (cached.total !== null) {
      closingTotal = cached.total;
      source = 'US Avg (cached)';
    } else {
      const freeze = new Date(new Date(g.gameDate).getTime() - NFL_CLOSING_TIME_MINUTES * 60 * 1000)
        .toISOString().replace(/\.\d{3}Z$/, 'Z');
      const had = cache.has(freeze.substring(0, 16));
      const events = await fetchTotalsSnapshot(freeze, cache);
      if (!had) oddsApiCalls++;
      const ev = (g.oddsApiId && events.find((e) => e.id === g.oddsApiId)) || matchOddsEvent(g.homeTeam, g.awayTeam, events)?.event || null;
      const c = ev ? extractConsensusTotal(ev, NFL_CONSENSUS_BOOKS) : null;
      if (c) {
        closingTotal = c.total;
        source = `US Avg (${c.books.length})`;
      }
      if (cached.found) await setCachedClosingTotal(g.gameId, closingTotal);
    }
    if (closingTotal === null) {
      skipped.push({ game: label, date: day, reason: 'no_total' });
      continue;
    }
    const adj = priceGame(snap, g, closingTotal, source, season);
    if (!adj) {
      skipped.push({ game: label, date: day, reason: 'team_missing' });
      continue;
    }
    await saveTotalsAdjustment(adj);
    await upsertTotalsTeams([snap.teams.get(g.homeTeam)!, snap.teams.get(g.awayTeam)!]);
    processed.push({ game: label, date: day, projected: adj.projectedTotal, closing: adj.closingTotal, adjustment: adj.adjustment });
    if (maxLedgerDate && g.gameDate < maxLedgerDate) needsReplay = true;
  }
  if (needsReplay) await replay(season);
  const last = [...totalsLedger.map((t) => t.gameDate.substring(0, 10)), ...processed.map((p) => p.date)].sort().pop() ?? null;
  await saveTotalsConfig({ ...snap.config, season, lastProcessedDate: last });

  return {
    success: true, action: 'sync', season, processedCount: processed.length, skippedCount: skipped.length,
    oddsApiCalls, replayed: needsReplay, processed, skipped,
    summary:
      `Totals sync: ${processed.length} games priced, ${skipped.length} skipped` +
      `${skipped.filter((s) => s.reason === 'no_total').length ? ` (${skipped.filter((s) => s.reason === 'no_total').length} no total)` : ''}` +
      `, ${oddsApiCalls} Odds API calls${needsReplay ? ', ledger replayed' : ''}.` +
      (processed.length ? ` Latest: ${processed[processed.length - 1].game} proj ${processed[processed.length - 1].projected} → close ${processed[processed.length - 1].closing}.` : ''),
  };
}

// ---------- replay ----------

async function replay(season: number) {
  const snap = await loadTotalsSnapshot(season);
  const ledger = await loadTotalsAdjustments(season);
  for (const t of snap.teams.values()) {
    t.marketTerm = t.initialMarketTerm;
    t.gamesProcessed = 0;
  }
  let rewritten = 0;
  const missing: string[] = [];
  for (const old of ledger) {
    const adj = priceGame(snap, old, old.closingTotal, old.closingSource, season);
    if (!adj) {
      missing.push(`${old.awayTeam} @ ${old.homeTeam}`);
      continue;
    }
    await saveTotalsAdjustment(adj);
    rewritten++;
  }
  const now = new Date().toISOString();
  for (const t of snap.teams.values()) t.updatedAt = now;
  await upsertTotalsTeams([...snap.teams.values()]);
  return {
    success: true, action: 'recalculate', season, gamesReplayed: ledger.length, rewritten, missing,
    summary: `Totals recalculated: ${ledger.length} games replayed from the seed terms.`,
  };
}

// ---------- handlers ----------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action: string = body.action ?? 'sync';
    if (action === 'seed') return NextResponse.json(await handleSeed(body));
    if (action === 'sync') return NextResponse.json(await handleSync(body));
    if (action === 'recalculate') return NextResponse.json(await replay(body.season ?? NFL_SEASON));
    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error('nfl/totals failed:', e);
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const seasonParam = request.nextUrl.searchParams.get('season');
    const snap = await loadTotalsSnapshot(seasonParam ? Number(seasonParam) : undefined);
    const season = seasonParam ? Number(seasonParam) : snap.config.season;
    const ledger = await loadTotalsAdjustments(season);
    const teams = [...snap.teams.values()].map((t) => {
      const f = fundamentalsFor(t, snap);
      return {
        teamName: t.teamName, espnId: t.espnId, espnAbbr: t.espnAbbr,
        pace: f.pace, offPpp: f.offPpp, defPpp: f.defPpp, statGames: f.games,
        priorPace: t.priorPace, priorOffPpp: t.priorOffPpp, priorDefPpp: t.priorDefPpp,
        marketTerm: t.marketTerm, initialMarketTerm: t.initialMarketTerm, gamesProcessed: t.gamesProcessed,
        // Points this team's offence would score vs an average defence at league pace
        offRating: round(snap.config.leagueAvgPace * f.offPpp, 1),
        defRating: round(snap.config.leagueAvgPace * f.defPpp, 1),
        updatedAt: t.updatedAt,
      };
    }).sort((x, y) => (y.offRating - y.defRating + y.marketTerm) - (x.offRating - x.defRating + x.marketTerm));
    return NextResponse.json({
      success: true, season, config: snap.config, teams, adjustments: [...ledger].reverse(), totalAdjustments: ledger.length,
      statsGames: new Set(snap.stats.map((r) => r.gameId)).size,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
