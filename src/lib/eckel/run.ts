// src/lib/eckel/run.ts
//
// Server-side compute-and-store, shared by the manual POST route and the
// weekly cron.

import { supabase } from '@/lib/supabase';
import { computeEckel } from './index';
import { fetchSeason } from './fetch';
import { EckelSnapshot } from './types';

export async function runEckelCompute(
  year: number,
  week: number | null
): Promise<{ snapshot: EckelSnapshot; storeError: string | null }> {
  const { drives, games } = await fetchSeason(year, week);
  if (!games.length || !drives.length) {
    throw new Error(`No CFBD data for ${year}${week ? ` through week ${week}` : ''}`);
  }
  const snapshot = computeEckel(drives, games, year, week);
  const { error } = await supabase.from('eckel_snapshots').insert({
    season: year,
    week,
    computed_at: snapshot.computedAt,
    data: snapshot,
  });
  return { snapshot, storeError: error ? error.message : null };
}
