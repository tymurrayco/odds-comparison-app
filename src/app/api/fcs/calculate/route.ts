// src/app/api/fcs/calculate/route.ts

/**
 * POST /api/fcs/calculate — FCS market-driven ratings orchestrator.
 *
 * Actions (body.action):
 * - 'sync' (default): process new completed FCS games — ESPN scoreboard
 *   (groups=81) for the game list, Odds API historical snapshot at
 *   kickoff-5min for the closing line (US consensus average), then
 *   adjustment = (closing - projected)/2 applied zero-sum.
 * - 'recalculate': reset every team to initial_rating and replay the full
 *   adjustment ledger chronologically.
 * - 'recalculate-from': same replay, but only rewrite adjustment rows dated
 *   >= body.fromDate (ratings always saved — changes cascade forward).
 *
 * Other body fields: startDate, endDate (YYYY-MM-DD), maxGames, retryMissing
 * (re-check games previously cached as "no line").
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ESPN_FCS_GROUP,
  ESPN_FCS_SCOREBOARD_URL,
  FCS_CLOSING_TIME_MINUTES,
  FCS_CONSENSUS_BOOKS,
  FCS_SEASON,
  FCS_SEASON_DATES,
  NCAAF_SPORT_KEY,
  ODDS_API_BASE_URL,
} from '@/lib/fcs/constants';
import {
  extractConsensusSpread,
  hfaForGame,
  processFcsGame,
  projectFcsSpread,
  roundToDecimal,
} from '@/lib/fcs/engine';
import {
  getCachedFcsClosingLine,
  getProcessedFcsGameIds,
  loadFcsAdjustments,
  loadFcsConfig,
  loadFcsRatings,
  saveFcsAdjustment,
  saveFcsClosingLine,
  saveFcsConfig,
  upsertFcsRatings,
} from '@/lib/fcs/supabase';
import { matchOddsEvent } from '@/lib/fcs/teamNames';
import { EspnFcsGame, FcsTeamRating } from '@/lib/fcs/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    markets?: Array<{
      key: string;
      outcomes?: Array<{ name: string; point?: number }>;
    }>;
  }>;
}

// ---------- ESPN game list ----------

async function fetchFcsGamesForDate(dateYmd: string): Promise<EspnFcsGame[]> {
  const url = `${ESPN_FCS_SCOREBOARD_URL}?dates=${dateYmd}&groups=${ESPN_FCS_GROUP}&limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status} for ${dateYmd}`);
  const json = await res.json();
  const out: EspnFcsGame[] = [];
  for (const event of json.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home');
    const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away');
    if (!home || !away) continue;
    out.push({
      id: String(event.id),
      date: comp.date ?? event.date,
      homeTeam: home.team?.displayName ?? '',
      awayTeam: away.team?.displayName ?? '',
      homeId: String(home.team?.id ?? ''),
      awayId: String(away.team?.id ?? ''),
      isNeutralSite: comp.neutralSite === true || comp.venue?.neutral === true,
      isCompleted: comp.status?.type?.completed === true,
    });
  }
  return out;
}

function* dateRange(startYmd: string, endYmd: string): Generator<string> {
  const d = new Date(`${startYmd}T00:00:00Z`);
  const end = new Date(`${endYmd}T00:00:00Z`);
  while (d <= end) {
    yield d.toISOString().substring(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// ---------- closing lines ----------

async function fetchHistoricalSnapshot(
  freezeIso: string,
  hourCache: Map<string, OddsEvent[]>
): Promise<OddsEvent[]> {
  const hourKey = freezeIso.substring(0, 13); // one API call per clock hour
  const cached = hourCache.get(hourKey);
  if (cached) return cached;

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/historical/sports/${NCAAF_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
    `&date=${encodeURIComponent(freezeIso)}` +
    `&bookmakers=${FCS_CONSENSUS_BOOKS.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Odds API historical HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  const events: OddsEvent[] = json?.data ?? [];
  hourCache.set(hourKey, events);
  return events;
}

// ---------- team resolution ----------

function buildLookups(ratings: Map<string, FcsTeamRating>) {
  const byEspnId = new Map<string, FcsTeamRating>();
  const byEspnName = new Map<string, FcsTeamRating>();
  for (const r of ratings.values()) {
    if (r.espnId) byEspnId.set(r.espnId, r);
    if (r.espnName) byEspnName.set(r.espnName.toLowerCase(), r);
  }
  return { byEspnId, byEspnName };
}

// ---------- handlers ----------

async function handleSync(body: {
  season?: number;
  startDate?: string;
  endDate?: string;
  maxGames?: number;
  retryMissing?: boolean;
}) {
  const config = await loadFcsConfig();
  const season = body.season ?? config.season ?? FCS_SEASON;
  const seasonDates = FCS_SEASON_DATES[season];
  if (!seasonDates) throw new Error(`No season dates configured for ${season}`);

  const ratings = await loadFcsRatings(season);
  if (ratings.size === 0) {
    throw new Error('fcs_ratings is empty — run the Massey seed first (POST /api/fcs/massey-sync)');
  }
  const { byEspnId, byEspnName } = buildLookups(ratings);
  const processedIds = await getProcessedFcsGameIds(season);

  // Smart start: 3 days before the last processed date
  let startDate = body.startDate;
  if (!startDate) {
    if (config.lastProcessedDate) {
      const d = new Date(`${config.lastProcessedDate}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 3);
      startDate = d.toISOString().substring(0, 10);
      if (startDate < seasonDates.start) startDate = seasonDates.start;
    } else {
      startDate = seasonDates.start;
    }
  }
  const today = new Date().toISOString().substring(0, 10);
  let endDate = body.endDate ?? (today < seasonDates.end ? today : seasonDates.end);
  if (endDate > today) endDate = today;
  const maxGames = body.maxGames ?? 200;

  const hourCache = new Map<string, OddsEvent[]>();
  const skipped: Array<{ game: string; date: string; reason: string }> = [];
  const processed: Array<{
    game: string;
    date: string;
    projected: number;
    closing: number;
    adjustment: number;
  }> = [];
  let oddsApiCalls = 0;
  let lastGameDate: string | null = config.lastProcessedDate;

  outer: for (const day of dateRange(startDate, endDate)) {
    const games = await fetchFcsGamesForDate(day.replace(/-/g, ''));
    for (const game of games) {
      if (processed.length >= maxGames) break outer;
      if (!game.isCompleted || processedIds.has(game.id)) continue;

      const label = `${game.awayTeam} @ ${game.homeTeam}`;
      const home = byEspnId.get(game.homeId) ?? byEspnName.get(game.homeTeam.toLowerCase());
      const away = byEspnId.get(game.awayId) ?? byEspnName.get(game.awayTeam.toLowerCase());
      if (!home || !away) {
        // FBS opponent, non-D1 opponent, or unlinked team — not part of the FCS pool
        skipped.push({
          game: label,
          date: day,
          reason: !home && !away ? 'neither_rated' : !home ? 'home_not_rated' : 'away_not_rated',
        });
        continue;
      }

      // Closing line: cache first, then one historical snapshot per clock hour
      let closingSpread: number | null = null;
      let closingSource = '';
      let oddsApiId: string | null = null;
      const cached = await getCachedFcsClosingLine(game.id);
      if (cached && !(cached.closingSpread === null && body.retryMissing)) {
        closingSpread = cached.closingSpread;
        closingSource = cached.closingSource ?? '';
        oddsApiId = cached.oddsApiId;
      } else {
        const freeze = new Date(
          new Date(game.date).getTime() - FCS_CLOSING_TIME_MINUTES * 60 * 1000
        ).toISOString();
        const hadHour = hourCache.has(freeze.substring(0, 13));
        const events = await fetchHistoricalSnapshot(freeze, hourCache);
        if (!hadHour) oddsApiCalls++;
        const match = matchOddsEvent(game.homeTeam, game.awayTeam, events);
        if (match) {
          oddsApiId = match.event.id;
          const consensus = extractConsensusSpread(match.event, FCS_CONSENSUS_BOOKS);
          if (consensus) {
            closingSpread = match.swapped ? -consensus.spread : consensus.spread;
            closingSource = `US Avg (${consensus.books.length})`;
          }
        }
        await saveFcsClosingLine({
          gameId: game.id,
          oddsApiId,
          gameDate: game.date,
          homeTeam: home.teamName,
          awayTeam: away.teamName,
          closingSpread,
          closingSource: closingSpread === null ? 'none' : closingSource,
          bookmakers: null,
        });
      }

      if (closingSpread === null) {
        skipped.push({ game: label, date: day, reason: 'no_line' });
        continue;
      }

      const adj = processFcsGame(
        {
          gameId: game.id,
          oddsApiId,
          date: game.date,
          homeTeam: home.teamName,
          awayTeam: away.teamName,
          closingSpread,
          closingSource,
          isNeutralSite: game.isNeutralSite,
        },
        ratings,
        config.hfaDefault,
        season
      );
      if (!adj) {
        skipped.push({ game: label, date: day, reason: 'process_failed' });
        continue;
      }

      await saveFcsAdjustment(adj);
      await upsertFcsRatings([ratings.get(home.teamName)!, ratings.get(away.teamName)!]);
      processedIds.add(game.id);
      processed.push({
        game: label,
        date: day,
        projected: adj.projectedSpread,
        closing: adj.closingSpread,
        adjustment: adj.adjustment,
      });
      if (!lastGameDate || day > lastGameDate) lastGameDate = day;
      await sleep(50);
    }
  }

  await saveFcsConfig({ ...config, season, lastProcessedDate: lastGameDate });

  return {
    success: true,
    action: 'sync',
    season,
    range: { startDate, endDate },
    processedCount: processed.length,
    skippedCount: skipped.length,
    oddsApiCalls,
    processed,
    skipped,
  };
}

async function replayLedger(season: number, saveFromDate?: string) {
  const config = await loadFcsConfig();
  const ratings = await loadFcsRatings(season);
  const adjustments = await loadFcsAdjustments(season);

  for (const r of ratings.values()) {
    r.rating = r.initialRating;
    r.gamesProcessed = 0;
  }

  let rewritten = 0;
  const missingTeams: string[] = [];
  for (const adj of adjustments) {
    const home = ratings.get(adj.homeTeam);
    const away = ratings.get(adj.awayTeam);
    if (!home || !away) {
      missingTeams.push(`${adj.awayTeam} @ ${adj.homeTeam}`);
      continue;
    }
    const hfaApplied = hfaForGame(home, adj.isNeutralSite, config.hfaDefault);
    const projected = projectFcsSpread(home.rating, away.rating, hfaApplied);
    const difference = roundToDecimal(adj.closingSpread - projected, 2);
    const adjustment = roundToDecimal(difference / 2, 2);

    adj.hfaApplied = hfaApplied;
    adj.projectedSpread = projected;
    adj.difference = difference;
    adj.adjustment = adjustment;
    adj.homeRatingBefore = home.rating;
    adj.awayRatingBefore = away.rating;
    away.rating = roundToDecimal(away.rating + adjustment, 2);
    home.rating = roundToDecimal(home.rating - adjustment, 2);
    away.gamesProcessed += 1;
    home.gamesProcessed += 1;
    adj.homeRatingAfter = home.rating;
    adj.awayRatingAfter = away.rating;

    if (!saveFromDate || adj.gameDate.substring(0, 10) >= saveFromDate) {
      await saveFcsAdjustment(adj);
      rewritten++;
    }
  }

  const now = new Date().toISOString();
  for (const r of ratings.values()) r.updatedAt = now;
  await upsertFcsRatings([...ratings.values()]);

  return {
    success: true,
    action: saveFromDate ? 'recalculate-from' : 'recalculate',
    season,
    gamesReplayed: adjustments.length,
    adjustmentRowsRewritten: rewritten,
    missingTeams,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action: string = body.action ?? 'sync';
    const season: number = body.season ?? FCS_SEASON;

    if (action === 'sync') {
      return NextResponse.json(await handleSync(body));
    }
    if (action === 'recalculate') {
      return NextResponse.json(await replayLedger(season));
    }
    if (action === 'recalculate-from') {
      if (!body.fromDate) throw new Error('recalculate-from requires fromDate (YYYY-MM-DD)');
      return NextResponse.json(await replayLedger(season, body.fromDate));
    }
    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error('fcs/calculate failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
