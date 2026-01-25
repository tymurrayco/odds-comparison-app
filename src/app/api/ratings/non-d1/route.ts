// src/app/api/ratings/non-d1/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  markGameAsNonD1,
  loadNonD1GameIds,
  loadNonD1Games,
  removeNonD1Game,
} from '@/lib/ratings/supabase';

// GET - Load non-D1 game IDs
export async function GET() {
  try {
    const gameIds = await loadNonD1GameIds();
    
    return NextResponse.json({
      success: true,
      gameIds: Array.from(gameIds),
    });
  } catch (error) {
    console.error('[Non-D1 API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load non-D1 games' },
      { status: 500 }
    );
  }
}

// POST - Mark a game as non-D1
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.gameId || !body.espnHome || !body.espnAway || !body.gameDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    const success = await markGameAsNonD1({
      gameId: body.gameId,
      espnHome: body.espnHome,
      espnAway: body.espnAway,
      gameDate: body.gameDate,
      notes: body.notes,
    });
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to mark game as non-D1' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Non-D1 API] POST Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a game from non-D1 list
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');
    
    if (!gameId) {
      return NextResponse.json(
        { success: false, error: 'Missing gameId' },
        { status: 400 }
      );
    }
    
    const success = await removeNonD1Game(gameId);
    
    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Failed to remove non-D1 game' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Non-D1 API] DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
