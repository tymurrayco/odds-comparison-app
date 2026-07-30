// scripts/eckel.test.ts
//
// Unit tests for the Eckel quality-drive classifier and garbage-time filter,
// using hand-built fake drives. Run: npm run test:eckel
import {
  isQualityDrive,
  isGarbageTime,
  drivePoints,
  isOffensiveTD,
} from '../src/lib/eckel/classify';
import { computeEckel } from '../src/lib/eckel';
import { EckelDrive, EckelGame } from '../src/lib/eckel/types';

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

const drive = (over: Partial<EckelDrive>): EckelDrive => ({
  gameId: 1,
  offense: 'A',
  defense: 'B',
  startPeriod: 1,
  endYardsToGoal: 60,
  startOffenseScore: 0,
  startDefenseScore: 0,
  endOffenseScore: 0,
  endDefenseScore: 0,
  driveResult: 'PUNT',
  isHomeOffense: true,
  ...over,
});

// --- quality-drive classifier ---
check('reaching the opp 40 is quality', isQualityDrive(drive({ endYardsToGoal: 40 })), true);
check('ending at the 41 is not', isQualityDrive(drive({ endYardsToGoal: 41 })), false);
check('big-play TD from own territory is quality',
  isQualityDrive(drive({ endYardsToGoal: 0, endOffenseScore: 7, driveResult: 'TD' })), true);
check('TD via score delta only (result string junk)',
  isQualityDrive(drive({ endYardsToGoal: 0, endOffenseScore: 6, driveResult: 'W12 UNKNOWN' })), true);
check('pick-six is NOT an offensive quality drive',
  isQualityDrive(drive({ endDefenseScore: 7, driveResult: 'INT TD', endYardsToGoal: 85 })), false);
check('punt from own side is not quality', isQualityDrive(drive({ endYardsToGoal: 55 })), false);
check('turnover at the opp 38 still counts (reached the 40)',
  isQualityDrive(drive({ endYardsToGoal: 38, driveResult: 'INT' })), true);

// --- drive points ---
check('TD drive counts 7 (even when PAT made it 6 at drive end)',
  drivePoints(drive({ endOffenseScore: 6, driveResult: 'TD' })), 7);
check('made FG counts 3', drivePoints(drive({ endOffenseScore: 3, driveResult: 'FG GOOD', endYardsToGoal: 20 })), 3);
check('missed FG counts 0', drivePoints(drive({ driveResult: 'MISSED FG', endYardsToGoal: 25 })), 0);
check('punt counts 0', drivePoints(drive({})), 0);
check('mid-game scores: TD detected from delta 21->28',
  isOffensiveTD(drive({ startOffenseScore: 21, endOffenseScore: 28, driveResult: 'TD' })), true);

// --- garbage-time filter ---
check('Q1 margin 44 is garbage', isGarbageTime(drive({ startPeriod: 1, startOffenseScore: 44 })), true);
check('Q1 margin 43 is NOT garbage', isGarbageTime(drive({ startPeriod: 1, startOffenseScore: 43 })), false);
check('Q2 margin 39 is garbage', isGarbageTime(drive({ startPeriod: 2, startOffenseScore: 39 })), true);
check('Q3 margin 29 is garbage', isGarbageTime(drive({ startPeriod: 3, startDefenseScore: 29 })), true);
check('Q3 margin 28 is NOT garbage', isGarbageTime(drive({ startPeriod: 3, startDefenseScore: 28 })), false);
check('Q4 margin 23 is garbage', isGarbageTime(drive({ startPeriod: 4, startOffenseScore: 23 })), true);
check('Q4 margin 22 is NOT garbage', isGarbageTime(drive({ startPeriod: 4, startOffenseScore: 22 })), false);
check('trailing side of a blowout is also garbage',
  isGarbageTime(drive({ startPeriod: 4, startDefenseScore: 30 })), true);
check('overtime is never garbage', isGarbageTime(drive({ startPeriod: 5, startOffenseScore: 50 })), false);

// --- end-to-end smoke test on a tiny fake season ---
const games: EckelGame[] = [
  { id: 1, season: 2025, week: 1, homeTeam: 'A', awayTeam: 'B', homePoints: 28, awayPoints: 10, neutralSite: false, completed: true },
  { id: 2, season: 2025, week: 2, homeTeam: 'B', awayTeam: 'A', homePoints: 7, awayPoints: 21, neutralSite: false, completed: true },
];
const fakeDrives: EckelDrive[] = [];
// game 1: A has 4 quality TD drives of 8; B has 1 of 8
for (let i = 0; i < 8; i++) {
  fakeDrives.push(drive({ gameId: 1, offense: 'A', defense: 'B', endYardsToGoal: i < 4 ? 0 : 60, endOffenseScore: i < 4 ? 7 : 0, startOffenseScore: 0, driveResult: i < 4 ? 'TD' : 'PUNT' }));
  fakeDrives.push(drive({ gameId: 1, offense: 'B', defense: 'A', endYardsToGoal: i < 1 ? 20 : 70, endOffenseScore: i < 1 ? 3 : 0, driveResult: i < 1 ? 'FG' : 'PUNT' }));
}
// game 2: A 3 quality of 8, B 1 of 8
for (let i = 0; i < 8; i++) {
  fakeDrives.push(drive({ gameId: 2, offense: 'A', defense: 'B', endYardsToGoal: i < 3 ? 0 : 55, endOffenseScore: i < 3 ? 7 : 0, driveResult: i < 3 ? 'TD' : 'PUNT' }));
  fakeDrives.push(drive({ gameId: 2, offense: 'B', defense: 'A', endYardsToGoal: i < 1 ? 0 : 65, endOffenseScore: i < 1 ? 7 : 0, driveResult: i < 1 ? 'TD' : 'PUNT' }));
}
const snap = computeEckel(fakeDrives, games, 2025);
const a = snap.teams.find((t) => t.team === 'A')!;
const b = snap.teams.find((t) => t.team === 'B')!;
check('A Eckel Rate = 7/16', Math.round(a.eckelRateOff * 1000), Math.round((7 / 16) * 1000));
check('A PPE = 7', a.pointsPerEckelOff, 7);
check('B Eckel Rate = 2/16', Math.round(b.eckelRateOff * 1000), 125);
check('A ranked above B on power', snap.teams[0].team, 'A');
check('A xWins near 2', a.xWins > 1.5, true);
check('records: A 2-0, B 0-2', [a.wins, a.losses, b.wins, b.losses], [2, 0, 0, 2]);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
