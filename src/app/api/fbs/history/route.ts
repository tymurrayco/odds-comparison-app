// src/app/api/fbs/history/route.ts
//
// GET /api/fbs/history[?season=]
// Every snapshot row for the season (src/lib/fbs/snapshots.ts), grouped
// for the History tab: weeks captured, per-team series for the futures
// and G5 sims, and the market's national-title consensus per team per
// week (median of the books' hold-free probabilities).

import { NextRequest, NextResponse } from 'next/server';
import { FBS_SEASON } from '@/lib/fbs/constants';
import { loadSnapshots, SnapshotRow } from '@/lib/fbs/snapshots';
import { median } from '@/lib/props/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface HistoryPoint {
  week: number;
  takenAt: string | null;
  rating: number | null;
  wins: number | null;
  losses: number | null;
  projWins: number | null;
  projLosses: number | null;
  titleProb: number | null;
  ccgProb: number | null;
  top2Prob: number | null;
  champProb: number | null;
  playoffProb: number | null;
  fairOdds: number | null;
  timing: string | null;
  marketProb: number | null;   // national title, consensus across books
  marketBooks: number;
  marketBestOdds: number | null;
}

export interface HistoryTeam {
  teamName: string;
  conference: string | null;
  inG5: boolean;
  points: HistoryPoint[];      // by week asc
}

export async function GET(request: NextRequest) {
  try {
    const season = Number(request.nextUrl.searchParams.get('season')) || FBS_SEASON;
    const rows = await loadSnapshots(season);
    const weeks = [...new Set(rows.map((r) => r.week))].sort((a, b) => a - b);
    const takenAt = new Map<number, string>();
    for (const r of rows) if (r.taken_at && !takenAt.has(r.week)) takenAt.set(r.week, r.taken_at);

    const teams = new Map<string, HistoryTeam>();
    const point = (t: HistoryTeam, week: number): HistoryPoint => {
      let p = t.points.find((x) => x.week === week);
      if (!p) {
        p = {
          week, takenAt: takenAt.get(week) ?? null,
          rating: null, wins: null, losses: null, projWins: null, projLosses: null,
          titleProb: null, ccgProb: null, top2Prob: null, champProb: null, playoffProb: null,
          fairOdds: null, timing: null, marketProb: null, marketBooks: 0, marketBestOdds: null,
        };
        t.points.push(p);
      }
      return p;
    };
    const teamOf = (r: SnapshotRow): HistoryTeam => {
      let t = teams.get(r.team_name);
      if (!t) {
        t = { teamName: r.team_name, conference: r.conference, inG5: false, points: [] };
        teams.set(r.team_name, t);
      }
      if (r.conference && !t.conference) t.conference = r.conference;
      return t;
    };

    const marketProbs = new Map<string, number[]>(); // `${team}|${week}` -> per-book probs
    for (const r of rows) {
      const t = teamOf(r);
      const p = point(t, r.week);
      if (r.source === 'futures') {
        p.rating = r.rating; p.wins = r.wins; p.losses = r.losses; p.projWins = r.proj_wins; p.projLosses = r.proj_losses;
        p.titleProb = r.title_prob; p.ccgProb = r.ccg_prob; p.top2Prob = r.top2_prob;
        p.fairOdds = r.fair_odds; p.timing = r.timing_signal;
      } else if (r.source === 'g5') {
        t.inG5 = true;
        p.champProb = r.champ_prob; p.playoffProb = r.playoff_prob;
        if (p.rating === null) { p.rating = r.rating; p.wins = r.wins; p.losses = r.losses; p.projWins = r.proj_wins; p.projLosses = r.proj_losses; }
      } else if (r.source === 'market' && r.market_prob !== null) {
        const k = `${r.team_name}|${r.week}`;
        if (!marketProbs.has(k)) marketProbs.set(k, []);
        marketProbs.get(k)!.push(Number(r.market_prob));
        p.marketBooks++;
        if (r.market_odds !== null && (p.marketBestOdds === null || r.market_odds > p.marketBestOdds)) p.marketBestOdds = r.market_odds;
      }
    }
    for (const t of teams.values()) {
      t.points.sort((a, b) => a.week - b.week);
      for (const p of t.points) {
        const probs = marketProbs.get(`${t.teamName}|${p.week}`);
        if (probs?.length) p.marketProb = Math.round(median(probs) * 100000) / 100000;
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
