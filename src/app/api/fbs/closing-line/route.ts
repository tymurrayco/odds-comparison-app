// src/app/api/fbs/closing-line/route.ts

/**
 * POST /api/fbs/closing-line
 * Manually set a closing spread for a game the Odds API didn't carry.
 * Body: { gameId: string, closingSpread: number }  (home perspective,
 * negative = home favored). The next sync processes the game automatically
 * and replays the ledger if the game predates already-processed games.
 */

import { NextRequest, NextResponse } from 'next/server';
import { setManualFbsClosingLine } from '@/lib/fbs/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const gameId = String(body.gameId ?? '');
    const closingSpread = Number(body.closingSpread);
    if (!gameId || !Number.isFinite(closingSpread)) {
      throw new Error('gameId and a numeric closingSpread are required');
    }
    if (Math.abs(closingSpread) > 70) {
      throw new Error(`Spread ${closingSpread} looks wrong (limit ±70)`);
    }
    const line = await setManualFbsClosingLine(gameId, closingSpread);
    return NextResponse.json({ success: true, line });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
