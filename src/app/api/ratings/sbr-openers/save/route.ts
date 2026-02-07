// src/app/api/ratings/sbr-openers/save/route.ts
// Saves SBR opener spreads to both ncaab_game_adjustments and closing_lines tables
// This makes SBR the single source of truth for opening lines across Schedule + History
// For games without existing closing_lines rows, INSERTs new rows so Schedule tab can display openers

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, loadTeamOverrides } from '@/lib/ratings/supabase';

interface SaveOpenerGame {
  sbrAway: string;
  sbrHome: string;
  kenpomAway: string;
  kenpomHome: string;
  openerSpread: number; // from home team perspective
  awayScore: number | null;
  homeScore: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, games } = body as { date: string; games: SaveOpenerGame[] };

    if (!date || !games || games.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing date or games' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Load overrides to build KenPom → Odds API name lookup
    const overrides = await loadTeamOverrides();
    const kenpomToOddsApi = new Map<string, string>();
    for (const override of overrides) {
      if (override.oddsApiName && override.kenpomName) {
        kenpomToOddsApi.set(override.kenpomName.toLowerCase(), override.oddsApiName);
      }
    }

    // Build timezone-aware UTC range for the Eastern date
    // Start at 3 AM UTC (10 PM ET prior night) to catch late-night Hawaii games
    // End at 8 AM UTC next day (3 AM ET) to catch late tips
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));   // 3 AM UTC = 10 PM ET prior night
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0)); // 8 AM UTC next day = 3 AM ET
    const startISO = startOfDay.toISOString();
    const endISO = endOfDay.toISOString();

    // Default commence_time for inserted rows: noon ET of the game date (5 PM UTC)
    const defaultCommenceTime = new Date(Date.UTC(year, month - 1, day, 17, 0, 0)).toISOString();

    let gameAdjUpdated = 0;
    let gameAdjSkipped = 0;
    let closingLinesUpdated = 0;
    let closingLinesInserted = 0;
    let closingLinesSkipped = 0;
    const gameAdjSkippedGames: string[] = [];
    const closingLinesSkippedGames: string[] = [];
    const errors: string[] = [];

    for (const game of games) {
      const { kenpomAway, kenpomHome, openerSpread, awayScore, homeScore } = game;
      const gameLabel = `${kenpomAway} @ ${kenpomHome}`;

      // ---- Write to ncaab_game_adjustments (uses KenPom names + game_date timestamptz) ----
      try {
        const { data: adjRows, error: adjSelectErr } = await supabase
          .from('ncaab_game_adjustments')
          .select('game_id')
          .eq('home_team', kenpomHome)
          .eq('away_team', kenpomAway)
          .gte('game_date', startISO)
          .lt('game_date', endISO);

        if (adjSelectErr) {
          errors.push(`[adj] Select error for ${gameLabel}: ${adjSelectErr.message}`);
        } else if (adjRows && adjRows.length > 0) {
          const gameIds = adjRows.map(r => r.game_id);
          const updatePayload: Record<string, number | null> = { opening_spread: openerSpread };
          if (awayScore !== null) updatePayload.away_score = awayScore;
          if (homeScore !== null) updatePayload.home_score = homeScore;
          
          const { error: adjUpdateErr } = await supabase
            .from('ncaab_game_adjustments')
            .update(updatePayload)
            .in('game_id', gameIds);

          if (adjUpdateErr) {
            errors.push(`[adj] Update error for ${gameLabel}: ${adjUpdateErr.message}`);
          } else {
            gameAdjUpdated += adjRows.length;
          }
        } else {
          gameAdjSkipped++;
          gameAdjSkippedGames.push(gameLabel);
        }
      } catch (err) {
        errors.push(`[adj] Exception for ${gameLabel}: ${err}`);
      }

      // ---- Write to closing_lines (uses Odds API names + commence_time timestamptz) ----
      try {
        const oddsApiHome = kenpomToOddsApi.get(kenpomHome.toLowerCase());
        const oddsApiAway = kenpomToOddsApi.get(kenpomAway.toLowerCase());

        if (oddsApiHome && oddsApiAway) {
          const { data: clRows, error: clSelectErr } = await supabase
            .from('closing_lines')
            .select('game_id')
            .eq('home_team', oddsApiHome)
            .eq('away_team', oddsApiAway)
            .gte('commence_time', startISO)
            .lt('commence_time', endISO);

          if (clSelectErr) {
            errors.push(`[cl] Select error for ${oddsApiAway}@${oddsApiHome}: ${clSelectErr.message}`);
          } else if (clRows && clRows.length > 0) {
            // UPDATE existing row
            const gameIds = clRows.map(r => r.game_id);
            const { error: clUpdateErr } = await supabase
              .from('closing_lines')
              .update({ opening_spread: openerSpread })
              .in('game_id', gameIds);

            if (clUpdateErr) {
              errors.push(`[cl] Update error for ${oddsApiAway}@${oddsApiHome}: ${clUpdateErr.message}`);
            } else {
              closingLinesUpdated += clRows.length;
            }
          } else {
            // INSERT new row so Schedule tab can display the opener
            const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
            const syntheticId = `sbr-${date}-${sanitize(oddsApiHome)}-${sanitize(oddsApiAway)}`;

            const { error: insertErr } = await supabase
              .from('closing_lines')
              .upsert({
                game_id: syntheticId,
                home_team: oddsApiHome,
                away_team: oddsApiAway,
                commence_time: defaultCommenceTime,
                opening_spread: openerSpread,
                spread: null,
                total: null,
                spread_bookmaker: null,
                frozen_at: defaultCommenceTime,
              }, { onConflict: 'game_id' });

            if (insertErr) {
              console.error(`[SBR Save] INSERT FAILED for ${oddsApiAway}@${oddsApiHome}:`, insertErr.message, insertErr.details, insertErr.hint);
              errors.push(`[cl] Insert error for ${oddsApiAway}@${oddsApiHome}: ${insertErr.message}`);
            } else {
              closingLinesInserted++;
            }
          }
        } else {
          closingLinesSkipped++;
          const missing = [];
          if (!oddsApiHome) missing.push(`home: ${kenpomHome}`);
          if (!oddsApiAway) missing.push(`away: ${kenpomAway}`);
          closingLinesSkippedGames.push(`${gameLabel} (no Odds API mapping for ${missing.join(', ')})`);
        }
      } catch (err) {
        errors.push(`[cl] Exception for ${kenpomAway}@${kenpomHome}: ${err}`);
      }
    }

    console.log(`[SBR Save Openers] Date: ${date} | Range: ${startISO} to ${endISO}`);
    console.log(`[SBR Save Openers] Games sent: ${games.length}`);
    console.log(`[SBR Save Openers] game_adjustments: ${gameAdjUpdated} updated, ${gameAdjSkipped} skipped`);
    if (gameAdjSkippedGames.length > 0) {
      console.log(`[SBR Save Openers] game_adjustments skipped:`, gameAdjSkippedGames);
    }
    console.log(`[SBR Save Openers] closing_lines: ${closingLinesUpdated} updated, ${closingLinesInserted} inserted, ${closingLinesSkipped} skipped`);
    if (closingLinesSkippedGames.length > 0) {
      console.log(`[SBR Save Openers] closing_lines skipped:`, closingLinesSkippedGames);
    }
    if (errors.length > 0) {
      console.error(`[SBR Save Openers] ❌ ${errors.length} ERRORS:`);
      for (const err of errors) {
        console.error(`  ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      date,
      gamesSent: games.length,
      gameAdjustments: {
        updated: gameAdjUpdated,
        skipped: gameAdjSkipped,
        skippedGames: gameAdjSkippedGames.length > 0 ? gameAdjSkippedGames : undefined,
      },
      closingLines: {
        updated: closingLinesUpdated,
        inserted: closingLinesInserted,
        skipped: closingLinesSkipped,
        skippedGames: closingLinesSkippedGames.length > 0 ? closingLinesSkippedGames : undefined,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[SBR Save Openers] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
