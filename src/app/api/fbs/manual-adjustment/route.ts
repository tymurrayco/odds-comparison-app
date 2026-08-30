// src/app/api/fbs/manual-adjustment/route.ts

/**
 * Manual rating adjustments — dated, replayable ledger entries for one team.
 *
 * POST   { teamName, delta, note?, adjustDate?, season? }  create
 * PATCH  { id, delta?, note?, adjustDate? }                edit
 * DELETE { id }                                            remove
 *
 * Every mutation replays the full ledger immediately so live ratings and all
 * downstream game adjustments reflect the change. If the replay fails, the
 * row is saved but flagged pending — the admin page shows a reminder until a
 * Recalculate applies it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { replayLedger } from '@/lib/fbs/replay';
import {
  deleteFbsManualAdjustment,
  insertFbsManualAdjustment,
  loadFbsRatings,
  updateFbsManualAdjustment,
} from '@/lib/fbs/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function replayOr(seasonNum: number) {
  try {
    return await replayLedger(seasonNum);
  } catch (e) {
    return {
      success: false as const,
      error: `Saved, but the ledger replay failed: ${
        e instanceof Error ? e.message : String(e)
      }. The adjustment is pending — run Recalculate to apply it.`,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const teamName = String(body.teamName ?? '');
    const delta = Number(body.delta);
    const season: number = body.season ?? FBS_SEASON;
    if (!teamName || !Number.isFinite(delta) || delta === 0) {
      throw new Error('teamName and a non-zero numeric delta are required');
    }
    if (Math.abs(delta) > 20) {
      throw new Error(`Delta ${delta} looks wrong (limit ±20)`);
    }
    const ratings = await loadFbsRatings(season);
    if (!ratings.has(teamName)) {
      throw new Error(`Unknown team: ${teamName}`);
    }
    const adjustDate = body.adjustDate
      ? new Date(body.adjustDate).toISOString()
      : new Date().toISOString();

    const created = await insertFbsManualAdjustment({
      teamName,
      season,
      adjustDate,
      delta,
      note: body.note ? String(body.note).slice(0, 300) : null,
    });
    const replay = await replayOr(season);
    return NextResponse.json({ success: true, id: created.id, replay });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw new Error('id is required');
    const fields: { delta?: number; note?: string | null; adjustDate?: string } = {};
    if (body.delta !== undefined) {
      const delta = Number(body.delta);
      if (!Number.isFinite(delta) || delta === 0) throw new Error('delta must be non-zero');
      if (Math.abs(delta) > 20) throw new Error(`Delta ${delta} looks wrong (limit ±20)`);
      fields.delta = delta;
    }
    if (body.note !== undefined) {
      fields.note = body.note ? String(body.note).slice(0, 300) : null;
    }
    if (body.adjustDate !== undefined) {
      fields.adjustDate = new Date(body.adjustDate).toISOString();
    }
    await updateFbsManualAdjustment(id, fields);
    const replay = await replayOr(body.season ?? FBS_SEASON);
    return NextResponse.json({ success: true, id, replay });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isFinite(id)) throw new Error('id is required');
    await deleteFbsManualAdjustment(id);
    const replay = await replayOr(body.season ?? FBS_SEASON);
    return NextResponse.json({ success: true, id, replay });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 }
    );
  }
}
