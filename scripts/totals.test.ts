// scripts/totals.test.ts
//
// Unit tests for the NFL totals model math (src/lib/nfl/totals/model.ts)
// using hand-built box-score rows. Run: npm run test:totals
import {
  blendFundamentals,
  fitMarketTerms,
  leagueAverages,
  projectTotal,
  rawTeamStats,
  regressPrior,
  totalsAdjustment,
} from '../src/lib/nfl/totals/model';
import type { TeamGameStats } from '../src/lib/football/boxScores';

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
const near = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places;

const row = (o: Partial<TeamGameStats>): TeamGameStats => ({
  league: 'nfl', gameId: 'g', teamEspnId: 'A', teamName: 'A', opponentEspnId: 'B', opponentName: 'B',
  gameDate: '2026-09-13T17:00:00Z', season: 2026, seasonType: 2, isHome: true, isNeutral: false,
  points: 0, oppPoints: 0, plays: 60, totalYards: 300, passAttempts: 30, rushAttempts: 30,
  netPassingYards: 200, rushingYards: 100, firstDowns: 18, turnovers: 1, possessionSeconds: 1800,
  ...o,
});

// --- raw season stats ---
const rows = [
  row({ gameId: 'g1', teamEspnId: 'A', opponentEspnId: 'B', points: 24, oppPoints: 17, plays: 60 }),
  row({ gameId: 'g1', teamEspnId: 'B', opponentEspnId: 'A', points: 17, oppPoints: 24, plays: 50, isHome: false }),
  row({ gameId: 'g2', teamEspnId: 'A', opponentEspnId: 'C', points: 30, oppPoints: 10, plays: 70, gameDate: '2026-09-20T17:00:00Z' }),
  row({ gameId: 'g2', teamEspnId: 'C', opponentEspnId: 'A', points: 10, oppPoints: 30, plays: 50, gameDate: '2026-09-20T17:00:00Z' }),
  row({ gameId: 'p1', teamEspnId: 'A', opponentEspnId: 'B', points: 99, oppPoints: 99, plays: 10, seasonType: 1 }),
  row({ gameId: 'p1', teamEspnId: 'B', opponentEspnId: 'A', points: 99, oppPoints: 99, plays: 10, seasonType: 1 }),
];
const sA = rawTeamStats(rows, 'A')!;
check('games counted (preseason skipped)', sA.games, 2);
check('pace = own plays per game', sA.pace, 65);
check('offPpp = points / own plays', near(sA.offPpp, 4), near(54 / 130, 4));
check('defPpp = allowed / opponent plays', near(sA.defPpp, 4), near(27 / 100, 4));
const cut = rawTeamStats(rows, 'A', '2026-09-20T00:00:00Z')!;
check('as-of cutoff keeps only earlier games', [cut.games, cut.pace], [1, 60]);
const lg = leagueAverages(rows)!;
check('league pace counts every side', near(lg.pace, 2), near(230 / 4, 2));
check('league ppp', near(lg.ppp, 4), near(81 / 230, 4));

// --- priors + blend ---
const L = { pace: 62, ppp: 0.37 };
const p = regressPrior({ pace: 68, offPpp: 0.46, defPpp: 0.31 }, L, 1 / 3);
check('prior regressed a third toward league avg', [near(p.pace, 1), near(p.offPpp, 3), near(p.defPpp, 3)], [66, 0.43, 0.33]);
check('missing prior = league average', regressPrior(null, L, 1 / 3), { pace: 62, offPpp: 0.37, defPpp: 0.37 });
const prior = { pace: 60, offPpp: 0.34, defPpp: 0.37 };
const one = blendFundamentals(prior, { games: 1, pace: 50, offPpp: 0.3, defPpp: 0.4 }, 4);
check('one game = 20% stats', [one.pace, near(one.offPpp, 3)], [58, 0.332]);
const four = blendFundamentals(prior, { games: 4, pace: 50, offPpp: 0.3, defPpp: 0.4 }, 4);
check('four games = half and half', four.pace, 55);
check('no games = prior', blendFundamentals(prior, null, 4), { ...prior, games: 0 });

// --- projection + update (the worked Bears example) ---
const bears = { pace: 61, offPpp: 0.34, defPpp: 0.37 };
const vikes = { pace: 65, offPpp: 0.37, defPpp: 0.35 };
const proj = projectTotal(bears, vikes, 1.5, -1.0, 0.36);
check('expected plays = average pace', proj.plays, 63);
check('home points', near(proj.homePts, 1), near(63 * 0.33, 1));
check('away points', near(proj.awayPts, 1), near(63 * 0.38, 1));
check('projected total incl. market terms', proj.projected, 45.2);
const upd = totalsAdjustment(47.5, 45.2);
check('miss split in half, same sign', [near(upd.difference, 2), near(upd.adjustment, 2)], [2.3, 1.15]);

// --- seed fit recovers known terms ---
const F = new Map(['A', 'B', 'C', 'D'].map((t) => [t, { pace: 62, offPpp: 0.37, defPpp: 0.37 }]));
const truth: Record<string, number> = { A: 2, B: -1, C: 0.5, D: -1.5 };
const pairs: [string, string][] = [['A', 'B'], ['C', 'D'], ['A', 'C'], ['B', 'D'], ['A', 'D'], ['B', 'C']];
const lines = pairs.map(([h, a]) => ({
  home: h, away: a, books: 4,
  total: projectTotal(F.get(h)!, F.get(a)!, 0, 0, 0.37).fundTotal + truth[h] + truth[a],
}));
const fit = fitMarketTerms(lines, F, 0.37, 0.001);
for (const t of Object.keys(truth)) check(`fit recovers ${t}`, near(fit.terms.get(t)!, 1), truth[t]);
check('fit rmse tiny', fit.rmse < 0.05, true);

console.log(`totals model: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
