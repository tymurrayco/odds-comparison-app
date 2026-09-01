// src/app/api/fcs/upcoming/route.ts

/**
 * GET /api/fcs/upcoming?days=7
 * Upcoming FCS-vs-FCS games with rating-projected spreads, plus the current
 * market consensus line (when books carry the game) and the model-vs-market
 * edge. Spreads are home-perspective (negative = home favored).
 *
 * One Odds API call per load (current odds, ~1 credit), cached in-process
 * for 5 minutes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ESPN_FCS_GROUP,
  ESPN_FCS_SCOREBOARD_URL,
  FCS_CONSENSUS_BOOKS,
  NCAAF_SPORT_KEY,
  ODDS_API_BASE_URL,
} from '@/lib/fcs/constants';
import {
  extractConsensusSpread,
  hfaForGame,
  projectFcsSpread,
  roundToDecimal,
} from '@/lib/fcs/engine';
import { loadFcsConfig, loadFcsRatings } from '@/lib/fcs/supabase';
import { loadFbsRatings } from '@/lib/fbs/supabase';
import { matchOddsEvent } from '@/lib/fcs/teamNames';
import { FcsTeamRating } from '@/lib/fcs/types';
import { FbsTeamRating } from '@/lib/fbs/types';
import { calibrateScaleOffset, impliedScaleOffset } from '@/lib/crossDivision';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

// Current-odds feed cache (per lambda instance)
let oddsCache: { at: number; events: OddsEvent[] } | null = null;
const ODDS_TTL_MS = 5 * 60 * 1000;

async function fetchCurrentOdds(): Promise<OddsEvent[]> {
  if (oddsCache && Date.now() - oddsCache.at < ODDS_TTL_MS) return oddsCache.events;
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error('ODDS_API_KEY missing');
  const url =
    `${ODDS_API_BASE_URL}/sports/${NCAAF_SPORT_KEY}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=spreads&oddsFormat=american` +
    `&bookmakers=${FCS_CONSENSUS_BOOKS.join(',')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Odds API HTTP ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  const events: OddsEvent[] = await res.json();
  oddsCache = { at: Date.now(), events };
  return events;
}

export async function GET(request: NextRequest) {
  try {
    const daysParam = parseInt(request.nextUrl.searchParams.get('days') ?? '7', 10);
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 14);

    const [config, ratings, fbsRatings] = await Promise.all([
      loadFcsConfig(),
      loadFcsRatings(),
      loadFbsRatings(),
    ]);
    const byEspnId = new Map<string, FcsTeamRating>();
    for (const r of ratings.values()) {
      if (r.espnId) byEspnId.set(r.espnId, r);
    }
    const fbsByEspnId = new Map<string, FbsTeamRating>();
    for (const r of fbsRatings.values()) {
      if (r.espnId) fbsByEspnId.set(r.espnId, r);
    }

    // Start yesterday (UTC) so late US-evening games aren't dropped near midnight UTC
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 1);
    const now = Date.now();

    let events: OddsEvent[] | null = null;
    let oddsError: string | null = null;

    const games: Array<{
      gameId: string;
      date: string;
      homeTeam: string;
      awayTeam: string;
      homeEspnName: string;
      awayEspnName: string;
      homeEspnId: string | null;
      awayEspnId: string | null;
      homeRating: number;
      awayRating: number;
      isNeutralSite: boolean;
      hfaApplied: number;
      projectedSpread: number;
      marketSpread: number | null;
      marketBooks: number;
      edge: number | null; // market - projected; positive = model likes HOME vs market
      state: string;
      crossDivision?: boolean; // FCS-vs-FBS; foreign rating shown scale-converted
    }> = [];

    // Cross-division candidates: projections need the market-calibrated scale
    // offset, which needs every lined cross game first — so collect during
    // the scan, project after it (see src/lib/crossDivision.ts). Here the
    // FBS rating is converted DOWN to the FCS scale for display; the spread
    // is identical either way.
    const crossRaw: Array<{
      gameId: string;
      date: string;
      fcs: FcsTeamRating;
      fbs: FbsTeamRating;
      fbsIsHome: boolean;
      homeEspnName: string;
      awayEspnName: string;
      isNeutralSite: boolean;
      hfaApplied: number;
      marketSpread: number | null;
      marketBooks: number;
      state: string;
    }> = [];

    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const ymd = d.toISOString().substring(0, 10).replace(/-/g, '');
      const res = await fetch(
        `${ESPN_FCS_SCOREBOARD_URL}?dates=${ymd}&groups=${ESPN_FCS_GROUP}&limit=200`
      );
      if (!res.ok) continue;
      const json = await res.json();

      for (const event of json.events ?? []) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        if (comp.status?.type?.completed === true) continue;
        const gameTime = new Date(comp.date ?? event.date).getTime();
        // keep games from ~4h ago (in progress) forward
        if (gameTime < now - 4 * 60 * 60 * 1000) continue;

        const homeC = comp.competitors?.find(
          (c: { homeAway: string }) => c.homeAway === 'home'
        );
        const awayC = comp.competitors?.find(
          (c: { homeAway: string }) => c.homeAway === 'away'
        );
        if (!homeC || !awayC) continue;
        const home = byEspnId.get(String(homeC.team?.id ?? ''));
        const away = byEspnId.get(String(awayC.team?.id ?? ''));
        const homeFbs = fbsByEspnId.get(String(homeC.team?.id ?? ''));
        const awayFbs = fbsByEspnId.get(String(awayC.team?.id ?? ''));
        if (games.some((g) => g.gameId === String(event.id))) continue;
        if (crossRaw.some((g) => g.gameId === String(event.id))) continue;

        // Cross-division game: exactly one side FCS-rated, the other FBS-rated.
        const crossFcs = home && !away && awayFbs ? home : away && !home && homeFbs ? away : null;
        if (crossFcs) {
          const fbsSide = (home ? awayFbs : homeFbs)!;
          const fbsIsHome = !home;
          const xNeutral = comp.neutralSite === true || comp.venue?.neutral === true;
          const homeHfa = fbsIsHome
            ? xNeutral
              ? 0
              : (fbsSide.hfa ?? config.hfaDefault)
            : hfaForGame(crossFcs, xNeutral, config.hfaDefault);
          let xMarket: number | null = null;
          let xBooks = 0;
          try {
            if (!events) events = await fetchCurrentOdds();
            const match = matchOddsEvent(
              homeC.team?.displayName ?? '',
              awayC.team?.displayName ?? '',
              events
            );
            if (match) {
              const consensus = extractConsensusSpread(match.event, FCS_CONSENSUS_BOOKS);
              if (consensus) {
                xMarket = match.swapped ? -consensus.spread : consensus.spread;
                xBooks = consensus.books.length;
              }
            }
          } catch (e) {
            oddsError = e instanceof Error ? e.message : String(e);
          }
          crossRaw.push({
            gameId: String(event.id),
            date: comp.date ?? event.date,
            fcs: crossFcs,
            fbs: fbsSide,
            fbsIsHome,
            homeEspnName:
              (fbsIsHome ? fbsSide.espnName : crossFcs.espnName) ??
              homeC.team?.displayName ?? '',
            awayEspnName:
              (fbsIsHome ? crossFcs.espnName : fbsSide.espnName) ??
              awayC.team?.displayName ?? '',
            isNeutralSite: xNeutral,
            hfaApplied: homeHfa,
            marketSpread: xMarket,
            marketBooks: xBooks,
            state: comp.status?.type?.state ?? 'pre',
          });
          continue;
        }
        if (!home || !away) continue; // both-FCS only from here

        const isNeutralSite = comp.neutralSite === true || comp.venue?.neutral === true;
        const hfaApplied = hfaForGame(home, isNeutralSite, config.hfaDefault);
        const projectedSpread = projectFcsSpread(home.rating, away.rating, hfaApplied);

        let marketSpread: number | null = null;
        let marketBooks = 0;
        try {
          if (!events) events = await fetchCurrentOdds();
          const match = matchOddsEvent(
            homeC.team?.displayName ?? '',
            awayC.team?.displayName ?? '',
            events
          );
          if (match) {
            const consensus = extractConsensusSpread(match.event, FCS_CONSENSUS_BOOKS);
            if (consensus) {
              marketSpread = match.swapped ? -consensus.spread : consensus.spread;
              marketBooks = consensus.books.length;
            }
          }
        } catch (e) {
          oddsError = e instanceof Error ? e.message : String(e);
        }

        games.push({
          gameId: String(event.id),
          date: comp.date ?? event.date,
          homeTeam: home.teamName,
          awayTeam: away.teamName,
          // ESPN display names ("Weber State Wildcats") — the bet-history rows
          // written from the Upcoming tab key their logos off these, not the
          // short rating-table names.
          homeEspnName: home.espnName ?? homeC.team?.displayName ?? home.teamName,
          awayEspnName: away.espnName ?? awayC.team?.displayName ?? away.teamName,
          homeEspnId: home.espnId,
          awayEspnId: away.espnId,
          homeRating: home.rating,
          awayRating: away.rating,
          isNeutralSite,
          hfaApplied,
          projectedSpread,
          marketSpread,
          marketBooks,
          edge:
            marketSpread === null
              ? null
              : roundToDecimal(marketSpread - projectedSpread, 1),
          state: comp.status?.type?.state ?? 'pre',
        });
      }
    }

    // Calibrate the FCS->FBS scale offset from the window's lined cross games
    // (same formula as the FBS route — the offset is direction-agnostic),
    // then project each on the FCS scale: FBS rating converted DOWN.
    const implied = crossRaw
      .filter((g) => g.marketSpread !== null)
      .map((g) =>
        impliedScaleOffset(
          g.marketSpread!,
          g.fbs.rating,
          g.fcs.rating,
          g.hfaApplied,
          g.fbsIsHome
        )
      );
    const calibration = calibrateScaleOffset(implied);
    for (const g of crossRaw) {
      const fbsAdj = roundToDecimal(g.fbs.rating - calibration.offset, 2);
      const homeRating = g.fbsIsHome ? fbsAdj : g.fcs.rating;
      const awayRating = g.fbsIsHome ? g.fcs.rating : fbsAdj;
      const projectedSpread = projectFcsSpread(homeRating, awayRating, g.hfaApplied);
      games.push({
        gameId: g.gameId,
        date: g.date,
        homeTeam: g.fbsIsHome ? g.fbs.teamName : g.fcs.teamName,
        awayTeam: g.fbsIsHome ? g.fcs.teamName : g.fbs.teamName,
        homeEspnName: g.homeEspnName,
        awayEspnName: g.awayEspnName,
        homeEspnId: g.fbsIsHome ? g.fbs.espnId : g.fcs.espnId,
        awayEspnId: g.fbsIsHome ? g.fcs.espnId : g.fbs.espnId,
        homeRating,
        awayRating,
        isNeutralSite: g.isNeutralSite,
        hfaApplied: g.hfaApplied,
        projectedSpread,
        marketSpread: g.marketSpread,
        marketBooks: g.marketBooks,
        edge:
          g.marketSpread === null
            ? null
            : roundToDecimal(g.marketSpread - projectedSpread, 1),
        state: g.state,
        crossDivision: true,
      });
    }

    games.sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId));

    return NextResponse.json({
      success: true,
      days,
      count: games.length,
      games,
      oddsError,
      crossDivision: {
        count: crossRaw.length,
        scaleOffset: calibration.offset,
        offsetSource: calibration.source,
        offsetSampleCount: calibration.sampleCount,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
