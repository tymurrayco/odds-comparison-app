// src/app/api/fbs/calculate/route.ts

/**
 * POST /api/fbs/calculate — FBS market-driven ratings orchestrator.
 *
 * Actions (body.action):
 * - 'sync' (default): process new completed FBS games — ESPN scoreboard
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
  ESPN_FBS_GROUP,
  ESPN_FBS_SCOREBOARD_URL,
  FBS_CLOSING_TIME_MINUTES,
  FBS_CONSENSUS_BOOKS,
  FBS_SEASON,
  FBS_SEASON_DATES,
  FBS_SYNC_LOOKBACK_DAYS,
  NCAAF_SPORT_KEY,
  ODDS_API_BASE_URL,
} from '@/lib/fbs/constants';
import { extractConsensusSpread, processFbsGame } from '@/lib/fbs/engine';
import {
  getCachedFbsClosingLine,
  getMaxFbsAdjustmentDate,
  getProcessedFbsGameIds,
  loadFbsConfig,
  loadFbsRatings,
  loadLinedFbsClosingLines,
  saveFbsAdjustment,
  saveFbsClosingLine,
  saveFbsConfig,
  upsertFbsRatings,
} from '@/lib/fbs/supabase';
import { replayLedger } from '@/lib/fbs/replay';
import { matchOddsEvent } from '@/lib/fbs/teamNames';
import { EspnFbsGame, FbsTeamRating } from '@/lib/fbs/types';

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

async function fetchFbsGamesForDate(dateYmd: string): Promise<EspnFbsGame[]> {
  const url = `${ESPN_FBS_SCOREBOARD_URL}?dates=${dateYmd}&groups=${ESPN_FBS_GROUP}&limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN scoreboard HTTP ${res.status} for ${dateYmd}`);
  const json = await res.json();
  const out: EspnFbsGame[] = [];
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

function shiftYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
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
  // One call per distinct freeze minute — same-kickoff games share a snapshot,
  // but a 22:59 kick never reuses a 22:05 snapshot (that line isn't "closing").
  const hourKey = freezeIso.substring(0, 16);
  const cached = hourCache.get(hourKey);
  if (cached) return cached;

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/historical/sports/${NCAAF_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
    `&date=${encodeURIComponent(freezeIso)}` +
    `&bookmakers=${FBS_CONSENSUS_BOOKS.join(',')}`;
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

function buildLookups(ratings: Map<string, FbsTeamRating>) {
  const byEspnId = new Map<string, FbsTeamRating>();
  const byEspnName = new Map<string, FbsTeamRating>();
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
  fullScan?: boolean;
}) {
  const config = await loadFbsConfig();
  const season = body.season ?? config.season ?? FBS_SEASON;
  const seasonDates = FBS_SEASON_DATES[season];
  if (!seasonDates) throw new Error(`No season dates configured for ${season}`);

  const ratings = await loadFbsRatings(season);
  if (ratings.size === 0) {
    throw new Error('fbs_ratings is empty — run the Brad Powers seed first (POST /api/fbs/seed)');
  }
  const { byEspnId, byEspnName } = buildLookups(ratings);
  const processedIds = await getProcessedFbsGameIds(season);

  // Scan back FBS_SYNC_LOOKBACK_DAYS from the last processed game. Processed
  // games skip via the ledger and unlined games skip via the closing-line
  // cache, so re-scanned days cost only one ESPN fetch each — but that fetch
  // per day added up across a full-season sweep until the request outlived a
  // phone browser's patience. The lookback still re-covers recent days, so a
  // game that completes late is picked up on a later sync; body.fullScan
  // sweeps from the opener, and body.startDate overrides both.
  const windowStart =
    body.fullScan || !config.lastProcessedDate
      ? seasonDates.start
      : [shiftYmd(config.lastProcessedDate, -FBS_SYNC_LOOKBACK_DAYS), seasonDates.start]
          .sort()
          .pop()!;
  const startDate = body.startDate ?? windowStart;
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

  // First: cached lines that gained a spread after their game was scanned
  // (manual entries, or backfills). These can predate the sync window, so
  // process them here and replay the ledger if order was broken. Season-window
  // filter is load-bearing: the cache table has no season column, and without
  // it the first sync of a new season would replay every prior-season line.
  let needsReplay = false;
  const maxLedgerDate = await getMaxFbsAdjustmentDate(season);
  const pendingLined = (await loadLinedFbsClosingLines()).filter(
    (l) =>
      !processedIds.has(l.gameId) &&
      l.homeTeam &&
      l.awayTeam &&
      l.gameDate &&
      l.gameDate.substring(0, 10) >= seasonDates.start &&
      l.gameDate.substring(0, 10) <= seasonDates.end
  );
  for (const line of pendingLined) {
    const day = line.gameDate!.substring(0, 10);
    const home = ratings.get(line.homeTeam!);
    const away = ratings.get(line.awayTeam!);
    const label = `${line.awayTeam} @ ${line.homeTeam}`;
    if (!home || !away) {
      skipped.push({ game: label, date: day, reason: 'manual_line_team_missing' });
      continue;
    }
    const adj = processFbsGame(
      {
        gameId: line.gameId,
        oddsApiId: line.oddsApiId,
        date: line.gameDate!,
        homeTeam: home.teamName,
        awayTeam: away.teamName,
        closingSpread: line.closingSpread!,
        closingSource: line.closingSource ?? 'Manual',
        isNeutralSite: line.isNeutralSite,
      },
      ratings,
      config.hfaDefault,
      season
    );
    if (!adj) continue;
    await saveFbsAdjustment(adj);
    await upsertFbsRatings([ratings.get(home.teamName)!, ratings.get(away.teamName)!]);
    processedIds.add(line.gameId);
    processed.push({
      game: label,
      date: day,
      projected: adj.projectedSpread,
      closing: adj.closingSpread,
      adjustment: adj.adjustment,
    });
    if (maxLedgerDate && day < maxLedgerDate) needsReplay = true;
    if (!lastGameDate || day > lastGameDate) lastGameDate = day;
  }

  // Replay right away (not at end of sync) so a crash later in the date scan
  // can't strand an out-of-order row in the ledger.
  if (needsReplay) await replayLedger(season);

  outer: for (const day of dateRange(startDate, endDate)) {
    const games = await fetchFbsGamesForDate(day.replace(/-/g, ''));
    for (const game of games) {
      if (processed.length >= maxGames) break outer;
      if (!game.isCompleted || processedIds.has(game.id)) continue;

      const label = `${game.awayTeam} @ ${game.homeTeam}`;
      const home = byEspnId.get(game.homeId) ?? byEspnName.get(game.homeTeam.toLowerCase());
      const away = byEspnId.get(game.awayId) ?? byEspnName.get(game.awayTeam.toLowerCase());
      if (!home || !away) {
        // FBS opponent, non-D1 opponent, or unlinked team — not part of the FBS pool
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
      const cached = await getCachedFbsClosingLine(game.id);
      if (cached && !(cached.closingSpread === null && body.retryMissing)) {
        closingSpread = cached.closingSpread;
        closingSource = cached.closingSource ?? '';
        oddsApiId = cached.oddsApiId;
      } else {
        // Odds API historical rejects millisecond precision in the date param
        const freeze = new Date(
          new Date(game.date).getTime() - FBS_CLOSING_TIME_MINUTES * 60 * 1000
        )
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z');
        const hadHour = hourCache.has(freeze.substring(0, 13));
        const events = await fetchHistoricalSnapshot(freeze, hourCache);
        if (!hadHour) oddsApiCalls++;
        const match = matchOddsEvent(game.homeTeam, game.awayTeam, events);
        if (match) {
          oddsApiId = match.event.id;
          const consensus = extractConsensusSpread(match.event, FBS_CONSENSUS_BOOKS);
          if (consensus) {
            closingSpread = match.swapped ? -consensus.spread : consensus.spread;
            closingSource = `US Avg (${consensus.books.length})`;
          }
        }
        await saveFbsClosingLine({
          gameId: game.id,
          oddsApiId,
          gameDate: game.date,
          homeTeam: home.teamName,
          awayTeam: away.teamName,
          isNeutralSite: game.isNeutralSite,
          closingSpread,
          closingSource: closingSpread === null ? 'none' : closingSource,
          bookmakers: null,
        });
      }

      if (closingSpread === null) {
        skipped.push({ game: label, date: day, reason: 'no_line' });
        continue;
      }

      const adj = processFbsGame(
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

      await saveFbsAdjustment(adj);
      await upsertFbsRatings([ratings.get(home.teamName)!, ratings.get(away.teamName)!]);
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

  await saveFbsConfig({ ...config, season, lastProcessedDate: lastGameDate });

  return {
    success: true,
    action: 'sync',
    season,
    range: { startDate, endDate },
    processedCount: processed.length,
    skippedCount: skipped.length,
    oddsApiCalls,
    replayed: needsReplay,
    processed,
    skipped,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const action: string = body.action ?? 'sync';
    const season: number = body.season ?? FBS_SEASON;

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
    console.error('fbs/calculate failed:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
