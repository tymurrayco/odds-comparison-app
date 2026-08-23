// src/lib/creditUsage.ts
// Server-side helper: snapshot the Odds API credit counter into
// odds_api_usage. The counter is per-KEY (shared with the mmbot), so points
// recorded here chart total burn regardless of who spent the credits.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Module-level throttle: one row per warm lambda per window. Cold starts may
// add an extra row each — harmless, the chart buckets by hour anyway.
let lastInsertMs = 0;

export async function recordCreditSnapshot(
  remaining: string | null,
  used: string | null,
  source: string,
  throttleMs = 5 * 60 * 1000
): Promise<void> {
  if (!remaining || !supabaseUrl || !supabaseKey) return;
  const now = Date.now();
  if (now - lastInsertMs < throttleMs) return;
  lastInsertMs = now;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('odds_api_usage').insert({
      remaining: parseInt(remaining, 10),
      used: parseInt(used ?? '0', 10),
      source,
    });
  } catch (e) {
    // Never let the gauge break a paid route.
    console.error('[creditUsage] snapshot failed:', e);
  }
}
