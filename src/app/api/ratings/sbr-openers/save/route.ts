// src/app/api/ratings/sbr-openers/save/route.ts
// Saves SBR opener spreads to both ncaab_game_adjustments and closing_lines tables
// This makes SBR the single source of truth for opening lines across Schedule + History

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, loadTeamOverrides } from '@/lib/ratings/supabase';

interface SaveOpenerGame {
  sbrAway: string;
  sbrHome: string;
  kenpomAway: string;
  kenpomHome: string;
  openerSpread: number; // from home team perspective
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
    // Games on Feb 6 EST could be stored as 2026-02-06T05:00:00Z through 2026-02-07T08:00:00Z
    const [year, month, day] = date.split('-').map(Number);
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 5, 0, 0));   // 5 AM UTC = midnight ET
    const endOfDay = new Date(Date.UTC(year, month - 1, day + 1, 8, 0, 0)); // 8 AM UTC next day = 3 AM ET
    const startISO = startOfDay.toISOString();
    const endISO = endOfDay.toISOString();

    let gameAdjUpdated = 0;
    let gameAdjSkipped = 0;
    let closingLinesUpdated = 0;
    let closingLinesSkipped = 0;
    const errors: string[] = [];

    for (const game of games) {
      const { kenpomAway, kenpomHome, openerSpread } = game;

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
          errors.push(`[adj] Select error for ${kenpomAway}@${kenpomHome}: ${adjSelectErr.message}`);
        } else if (adjRows && adjRows.length > 0) {
          const gameIds = adjRows.map(r => r.game_id);
          const { error: adjUpdateErr } = await supabase
            .from('ncaab_game_adjustments')
            .update({ opening_spread: openerSpread })
            .in('game_id', gameIds);

          if (adjUpdateErr) {
            errors.push(`[adj] Update error for ${kenpomAway}@${kenpomHome}: ${adjUpdateErr.message}`);
          } else {
            gameAdjUpdated += adjRows.length;
          }
        } else {
          gameAdjSkipped++;
        }
      } catch (err) {
        errors.push(`[adj] Exception for ${kenpomAway}@${kenpomHome}: ${err}`);
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
            closingLinesSkipped++;
          }
        } else {
          closingLinesSkipped++;
        }
      } catch (err) {
        errors.push(`[cl] Exception for ${kenpomAway}@${kenpomHome}: ${err}`);
      }
    }

    console.log(`[SBR Save Openers] Date: ${date} | Range: ${startISO} to ${endISO}`);
    console.log(`[SBR Save Openers] Games sent: ${games.length}`);
    console.log(`[SBR Save Openers] game_adjustments: ${gameAdjUpdated} updated, ${gameAdjSkipped} skipped`);
    console.log(`[SBR Save Openers] closing_lines: ${closingLinesUpdated} updated, ${closingLinesSkipped} skipped`);
    if (errors.length > 0) {
      console.log(`[SBR Save Openers] Errors: ${errors.length}`, errors.slice(0, 5));
    }

    return NextResponse.json({
      success: true,
      date,
      gamesSent: games.length,
      gameAdjustments: { updated: gameAdjUpdated, skipped: gameAdjSkipped },
      closingLines: { updated: closingLinesUpdated, skipped: closingLinesSkipped },
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
