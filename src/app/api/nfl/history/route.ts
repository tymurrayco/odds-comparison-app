// src/app/api/nfl/history/route.ts
//
// GET /api/nfl/history[?season=]
// Every NFL snapshot row for the season, grouped for the History tab:
// weeks captured and per-team series (model probabilities plus the books'
// Super Bowl consensus — median of the hold-free probabilities).

import { NextRequest, NextResponse } from 'next/server';
import { NFL_SEASON } from '@/lib/nfl/constants';
import { loadNflSnapshots } from '@/lib/nfl/snapshots';
import { median } from '@/lib/props/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Point {
  week: number;
  takenAt: string | null;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  projWins: number | null;
  projLosses: number | null;
  divProb: number | null;
  playoffProb: number | null;
  seed1Prob: number | null;
  confProb: number | null;
  sbProb: number | null;
  divOdds: number | null;
  timing: string | null;
  marketProb: number | null;
  marketBooks: number;
  marketBestOdds: number | null;
}
interface Team { teamName: string; group: string | null; conference: string | null; points: Point[] }

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || NFL_SEASON;
    const rows = await loadNflSnapshots(season);
    const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
    const takenAt = new Map<number, string>();
    for (const r of rows) if (r.taken_at && !takenAt.has(r.week)) takenAt.set(r.week, r.taken_at);

    const teams = new Map<string, Team>();
    const point = (t: Team, week: number): Point => {
      let p = t.points.find((x) => x.week === week);
      if (!p) {
        p = {
          week, takenAt: takenAt.get(week) ?? null,
          rating: null, wins: null, losses: null, ties: null, projWins: null, projLosses: null,
          divProb: null, playoffProb: null, seed1Prob: null, confProb: null, sbProb: null,
          divOdds: null, timing: null, marketProb: null, marketBooks: 0, marketBestOdds: null,
        };
        t.points.push(p);
      }
      return p;
    };
    const probs = new Map<string, number[]>();
    for (const r of rows) {
      let t = teams.get(r.team_name);
      if (!t) {
        t = { teamName: r.team_name, group: r.division, conference: r.conference, points: [] };
        teams.set(r.team_name, t);
      }
      if (r.division && !t.group) t.group = r.division;
      const p = point(t, r.week);
      if (r.source === 'futures') {
        p.rating = r.rating; p.wins = r.wins; p.losses = r.losses; p.ties = r.ties; p.projWins = r.proj_wins; p.projLosses = r.proj_losses;
        p.divProb = r.div_prob; p.playoffProb = r.playoff_prob; p.seed1Prob = r.seed1_prob; p.confProb = r.conf_prob; p.sbProb = r.sb_prob;
        p.divOdds = r.div_odds; p.timing = r.timing_signal;
      } else if (r.source === 'market' && r.market_prob !== null) {
        const k = `${r.team_name}|${r.week}`;
        if (!probs.has(k)) probs.set(k, []);
        probs.get(k)!.push(Number(r.market_prob));
        p.marketBooks++;
        if (r.market_odds !== null && (p.marketBestOdds === null || r.market_odds > p.marketBestOdds)) p.marketBestOdds = r.market_odds;
      }
    }
    for (const t of teams.values()) {
      t.points.sort((a, b) => a.week - b.week);
      for (const p of t.points) {
        const arr = probs.get(`${t.teamName}|${p.week}`);
        if (arr?.length) p.marketProb = Math.round(median(arr) * 100000) / 100000;
      }
    }
    return NextResponse.json({
      success: true,
      season,
      weeks: weeks.map((w) => ({ week: w, takenAt: takenAt.get(w) ?? null })),
      teams: [...teams.values()].sort((a, b) => a.teamName.localeCompare(b.teamName)),
      rows: rows.length,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
