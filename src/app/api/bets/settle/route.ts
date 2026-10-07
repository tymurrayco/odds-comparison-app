// src/app/api/bets/settle/route.ts
//
// GET /api/bets/settle         → settle (cron; also callable with the admin cookie)
// GET /api/bets/settle?dry=1   → preview only, writes nothing
//
// Walks pending straight bets (spread / moneyline / total / team_total) whose
// event date has arrived, finds the final score on ESPN, grades the bet with
// src/lib/betSettle.ts and writes status + a "Final: ..." result. Props,
// parlays, teasers and futures are left for hand-settling. A bet is only
// touched while still `pending`, so a manual status always wins.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rowToBet, type DbBetRow } from '@/lib/betTypes';
import { gradeBet } from '@/lib/betSettle';
import { matchEspnTeam, type EspnTeamLike } from '@/lib/espnTeamMatch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SETTLEABLE = ['spread', 'moneyline', 'total', 'team_total'];

// bets.league label → ESPN scoreboard path (+ extra query for college lists)
const ESPN: Record<string, { path: string; query: string[] }> = {
  NFL: { path: 'football/nfl', query: [''] },
  NCAAF: { path: 'football/college-football', query: ['&groups=80', '&groups=81'] },
  NCAAB: { path: 'basketball/mens-college-basketball', query: ['&groups=50'] },
  NBA: { path: 'basketball/nba', query: [''] },
  NHL: { path: 'hockey/nhl', query: [''] },
  MLB: { path: 'baseball/mlb', query: [''] },
  CFL: { path: 'football/cfl', query: [''] },
};

interface EspnGame {
  completed: boolean;
  teams: { team: EspnTeamLike; score: number }[];
}

const shift = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
};

function loadGames(cache: Map<string, Promise<EspnGame[]>>, league: string, ymd: string): Promise<EspnGame[]> {
  const key = `${league}|${ymd}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const cfg = ESPN[league];
  const p = (async () => {
    const pages = await Promise.all(
      cfg.query.map(async (q) => {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard?dates=${ymd.replace(/-/g, '')}&limit=300${q}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
        return res.ok ? res.json() : null;
      })
    );
    const out: EspnGame[] = [];
    for (const page of pages) {
      for (const ev of page?.events ?? []) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;
        out.push({
          completed: !!ev.status?.type?.completed,
          teams: (comp.competitors ?? []).map((c: { team: EspnTeamLike; score: string }) => ({
            team: c.team,
            score: Number(c.score),
          })),
        });
      }
    }
    return out;
  })();
  cache.set(key, p);
  return p;
}

export async function GET(req: NextRequest) {
  const dry = req.nextUrl.searchParams.get('dry') === '1';
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const today = new Date().toISOString().substring(0, 10);

  const { data, error } = await sb
    .from('bets')
    .select('*')
    .eq('deleted', false)
    .eq('status', 'pending')
    .in('bet_type', SETTLEABLE)
    .lte('event_date', today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cache = new Map<string, Promise<EspnGame[]>>();
  const report: { id: string; bet: string; game: string; outcome: string }[] = [];
  let settled = 0;

  for (const row of data as DbBetRow[]) {
    const bet = rowToBet(row);
    const line = (outcome: string) => report.push({ id: bet.id, bet: bet.bet, game: bet.description, outcome });
    try {
      if (!ESPN[bet.league] || !bet.awayTeam || !bet.homeTeam) {
        line('skipped: unsupported league / missing teams');
        continue;
      }
      // ESPN files late games under the next calendar day, so look at both
      const games = [
        ...(await loadGames(cache, bet.league, bet.eventDate)),
        ...(await loadGames(cache, bet.league, shift(bet.eventDate, 1))),
      ];
      const game = games.find((g) => {
        const teams = g.teams.map((t) => t.team);
        const a = matchEspnTeam(bet.awayTeam!, teams);
        const h = matchEspnTeam(bet.homeTeam!, teams);
        return a && h && String(a.id) !== String(h.id);
      });
      if (!game) {
        line('no ESPN game found');
        continue;
      }
      if (!game.completed) {
        line('not final yet');
        continue;
      }

      const teams = game.teams.map((t) => t.team);
      const awayId = String(matchEspnTeam(bet.awayTeam, teams)!.id);
      const away = game.teams.find((t) => String(t.team.id) === awayId)!;
      const home = game.teams.find((t) => String(t.team.id) !== awayId)!;
      const grade = gradeBet(bet, { away: away.score, home: home.score });
      if (!grade) {
        line('could not grade (team/line not parsed)');
        continue;
      }

      if (!dry) {
        const { error: upErr } = await sb
          .from('bets')
          .update({ status: grade.status, result: grade.result })
          .eq('id', bet.id)
          .eq('status', 'pending');
        if (upErr) {
          line(`write failed: ${upErr.message}`);
          continue;
        }
      }
      settled++;
      line(`${grade.status} — ${grade.result}`);
    } catch (e) {
      line(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ dry, checked: data.length, settled, report });
}
