// src/app/api/bets/route.ts
//
// The ONLY place the `bets` table is written. The browser used to insert /
// update / soft-delete straight through the anon key (RLS off → anyone could
// edit Tyler's bet history from dev tools). Now:
//   POST   { bet }          → insert, returns the row
//   PATCH  { id, updates }  → update, returns the row
//   DELETE { id }           → soft delete (deleted = true)
// src/middleware.ts requires the admin cookie for every non-GET under /api,
// so strangers get 404 before this code runs. Writes use the service-role
// key (bypasses RLS once sql/bets_rls.sql is applied); reads stay public and
// client-side (fetchBets, myGameBets, /bet/[id]).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betToInsertRow, betToUpdateRow, type Bet } from '@/lib/betTypes';

export const dynamic = 'force-dynamic';

function serverClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Works while RLS is off on `bets`; once sql/bets_rls.sql runs, anon
    // writes are refused and this env var becomes required.
    console.warn('[bets] SUPABASE_SERVICE_ROLE_KEY unset — writing with the anon key');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const REQUIRED: (keyof Omit<Bet, 'id'>)[] = ['date', 'eventDate', 'sport', 'league', 'betType', 'bet', 'odds', 'stake', 'status'];

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const bet = body?.bet as Omit<Bet, 'id'> | undefined;
  if (!bet || typeof bet !== 'object') {
    return NextResponse.json({ error: 'Body must be { bet }' }, { status: 400 });
  }
  const missing = REQUIRED.filter((k) => bet[k] === undefined || bet[k] === null || bet[k] === '');
  if (missing.length) {
    return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 });
  }

  const { data, error } = await serverClient()
    .from('bets')
    .insert([betToInsertRow(bet)])
    .select()
    .single();
  if (error) {
    console.error('[bets] insert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ bet: data });
}

export async function PATCH(req: NextRequest) {
  const body = await readJson(req);
  const id = typeof body?.id === 'string' ? body.id : null;
  const updates = body?.updates as Partial<Bet> | undefined;
  if (!id || !updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'Body must be { id, updates }' }, { status: 400 });
  }
  const row = betToUpdateRow(updates);
  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in updates' }, { status: 400 });
  }

  const { data, error } = await serverClient()
    .from('bets')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('[bets] update failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
  }
  return NextResponse.json({ bet: data });
}

export async function DELETE(req: NextRequest) {
  const body = await readJson(req);
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Body must be { id }' }, { status: 400 });

  const { error } = await serverClient()
    .from('bets')
    .update({ deleted: true })
    .eq('id', id);
  if (error) {
    console.error('[bets] delete failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
