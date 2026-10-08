// src/app/api/bets/route.ts
//
// The ONLY place the `bets` table is written.
//   POST   { bet }          → insert for the signed-in user, returns the row
//   PATCH  { id, updates }  → update one of the user's own bets, returns the row
//   DELETE { id }           → soft delete (deleted = true) one of the user's own bets
//
// Every request must carry the visitor's Supabase access token
// (`Authorization: Bearer …`, sent by betService.ts). The route asks Supabase
// who that token belongs to, stamps `user_id` on inserts and limits updates /
// deletes to rows with the same `user_id`. src/middleware.ts lets this path
// through its admin gate because the check happens here.
//
// Writes use the service-role key (bypasses RLS; the user_id filters above
// are what keep people in their own rows). Reads stay client-side
// (fetchBets, myGameBets) and are limited to the owner by RLS.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { betToInsertRow, betToUpdateRow, type Bet } from '@/lib/betTypes';

export const dynamic = 'force-dynamic';

function serverClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // RLS on `bets` has no write policies, so without this env var every
    // write is refused ("new row violates row-level security policy").
    console.warn('[bets] SUPABASE_SERVICE_ROLE_KEY unset — writing with the anon key');
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** The user id behind the request's bearer token, or null. */
async function userIdOf(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data, error } = await anon.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

const signedOut = () => NextResponse.json({ error: 'Sign in to save bets' }, { status: 401 });

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
  const userId = await userIdOf(req);
  if (!userId) return signedOut();

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
    .insert([{ ...betToInsertRow(bet), user_id: userId }])
    .select()
    .single();
  if (error) {
    console.error('[bets] insert failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ bet: data });
}

export async function PATCH(req: NextRequest) {
  const userId = await userIdOf(req);
  if (!userId) return signedOut();

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

  // Someone else's bet matches no row → PGRST116 → 404, same as a bad id
  const { data, error } = await serverClient()
    .from('bets')
    .update(row)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) {
    console.error('[bets] update failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 });
  }
  return NextResponse.json({ bet: data });
}

export async function DELETE(req: NextRequest) {
  const userId = await userIdOf(req);
  if (!userId) return signedOut();

  const body = await readJson(req);
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return NextResponse.json({ error: 'Body must be { id }' }, { status: 400 });

  const { error } = await serverClient()
    .from('bets')
    .update({ deleted: true })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    console.error('[bets] delete failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
