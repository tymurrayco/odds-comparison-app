// scripts/props.test.ts — run with `npm run test:props`
// Engine fixtures come straight from the Circles Off methodology video:
// proj 80 / SD 45 → 56.7% over 72.5 (normal); Jacobs measured SD 29.6 →
// 60.0% normal vs 53.8% lognormal, lognormal median 75.0; devig −120/−102
// → 51.9% fair over.

import {
  mean, median, stdDev, normCdf, lognormalParams, probOver,
  americanToProb, americanToDecimal, probToAmerican, devig, expectedValue,
  priceLadder, syntheticLines,
} from '../src/lib/props/engine';
import { computeReference, measurePlayer } from '../src/lib/props/reference';
import { PROP_MARKETS, PlayerGameLog, marketByKey } from '../src/lib/props/markets';
import { parseCsv, parseWeeklyStats } from '../src/lib/props/nflverse';

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function close(name: string, actual: number, expected: number, tol: number) {
  ok(name, Math.abs(actual - expected) <= tol, `expected ${expected}, got ${actual}`);
}

console.log('basic stats');
close('mean', mean([1, 2, 3, 4]), 2.5, 1e-12);
close('median odd', median([3, 1, 2]), 2, 1e-12);
close('median even', median([4, 1, 3, 2]), 2.5, 1e-12);
close('stdDev sample', stdDev([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.001);

console.log('normal CDF');
close('Φ(0)', normCdf(0), 0.5, 1e-9);
close('Φ(1.96)', normCdf(1.96), 0.975, 0.0005);
close('Φ(−1)', normCdf(-1), 0.1587, 0.0005);

console.log('video layer 1: proj 80, SD 45 (0.56 multiplier), line 72.5 at −120');
close('P(over) normal', probOver(80, 45, 72.5, 'normal'), 0.567, 0.002);
close('breakeven −120', americanToProb(-120), 0.5455, 0.0005);
close('EV ≈ +3.9%', expectedValue(probOver(80, 45, 72.5, 'normal'), -120), 0.039, 0.003);

console.log('video layer 2/3: Jacobs measured mean 80, SD 29.6');
close('P(over) normal ≈ 60%', probOver(80, 29.6, 72.5, 'normal'), 0.600, 0.003);
close('P(over) lognormal ≈ 53.8%', probOver(80, 29.6, 72.5, 'lognormal'), 0.538, 0.003);
close('lognormal median ≈ 75', lognormalParams(80, 29.6).median, 75.0, 0.15);
const jr = expectedValue(probOver(80, 29.6, 72.5, 'lognormal'), -120);
ok('lognormal flips EV negative', jr < 0, `EV = ${jr}`);

console.log('devig: over −120 / under −102');
const d = devig(-120, -102);
close('fair P(over) ≈ 51.9%', d.pOver, 0.519, 0.002);
close('overround ≈ 5%', d.overround, 0.0505, 0.002);

console.log('odds conversions');
close('americanToDecimal(-120)', americanToDecimal(-120), 1.8333, 0.0005);
close('americanToDecimal(+150)', americanToDecimal(150), 2.5, 1e-9);
ok('probToAmerican(0.5455) ≈ −120', Math.abs(probToAmerican(0.5455) - -120) <= 1);
ok('probToAmerican(0.4) = +150', probToAmerican(0.4) === 150);
ok('roundtrip +215', Math.abs(americanToProb(probToAmerican(americanToProb(215))) - americanToProb(215)) < 1e-6);

console.log('ladder');
const lines = syntheticLines(80, 10);
ok('synthetic lines centered on 80', lines.includes(79.5) && lines.length === 7, JSON.stringify(lines));
const book = new Map([[72.5, { over: -120 as number | null, under: -102 as number | null }]]);
const ladder = priceLadder(80, 29.6, 'lognormal', [52.5, 72.5, 99.5], book);
ok('P(over) decreases up the ladder', ladder[0].pOver > ladder[1].pOver && ladder[1].pOver > ladder[2].pOver);
ok('book EV only where priced', ladder[1].overEv !== null && ladder[0].overEv === null);
close('ladder P matches probOver', ladder[1].pOver, probOver(80, 29.6, 72.5, 'lognormal'), 1e-12);
ok('deep alt over is near-certain', ladder[0].pOver > 0.8);

console.log('CSV parsing');
const csvRows = parseCsv('a,"b,with comma",c\n1,"say ""hi""",3\n');
ok('quoted comma', csvRows[0][1] === 'b,with comma');
ok('escaped quote', csvRows[1][1] === 'say "hi"');
ok('row count', csvRows.length === 2);

const header =
  'player_id,player_name,player_display_name,position,position_group,headshot_url,season,week,season_type,game_id,team,opponent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds';
const mk = (pos: string, wk: number, carries: number, rush: number, type = 'REG') =>
  `00-1,J.Test,Josh Test,${pos},${pos},"http://x,y",2024,${wk},${type},2024_0${wk},LV,DEN,0,0,0,0,0,${carries},${rush},0,1,2,10,0`;
const sampleCsv = [header, mk('RB', 1, 15, 80), mk('RB', 2, 20, 120), mk('K', 3, 0, 0), mk('RB', 4, 12, 60, 'POST')].join('\n');
const logs = parseWeeklyStats(sampleCsv);
ok('filters kickers', logs.length === 3);
ok('keeps POST rows', logs.some((g) => g.season_type === 'POST'));
ok('parses stats', logs[0].rushing_yards === 80 && logs[0].carries === 15);

console.log('reference derivation');
// Synthetic RB: 10 REG games alternating 60/100 → mean 80, and one noise player below the role floor
const synth: PlayerGameLog[] = [];
for (let w = 1; w <= 10; w++) {
  synth.push({
    player_id: '00-1', player_name: 'Josh Test', position: 'RB', team: 'LV', opponent: 'DEN',
    season: 2024, week: w, season_type: 'REG',
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0,
    carries: 16, rushing_yards: w % 2 ? 60 : 100, rushing_tds: 0,
    receptions: 1, targets: 2, receiving_yards: 10, receiving_tds: 0,
  });
  synth.push({
    player_id: '00-2', player_name: 'Backup Guy', position: 'RB', team: 'LV', opponent: 'DEN',
    season: 2024, week: w, season_type: 'REG',
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0,
    carries: 2, rushing_yards: 8, rushing_tds: 0,
    receptions: 0, targets: 0, receiving_yards: 0, receiving_tds: 0,
  });
}
const ref = computeReference(synth, [2024]);
const rbRef = ref.markets['rush_yds']?.['RB'];
ok('one qualifying season (role floor)', rbRef?.overall.n === 1, JSON.stringify(rbRef?.overall));
// mean 80, sample sd of alternating 60/100 = sqrt(400*10/9) ≈ 21.08 → CV ≈ 0.264
close('multiplier = CV', rbRef?.overall.multiplier ?? NaN, 0.264, 0.002);
ok('tier bucket 80+', rbRef?.tiers.find((t) => t.label === '80+')?.n === 1);
ok('symmetric season not skewed', rbRef?.meanAboveMedianPct === 0);

console.log('measurePlayer');
const def = marketByKey('rush_yds')!;
const ms = measurePlayer(synth.filter((g) => g.player_id === '00-1'), def, {});
ok('measures 10 games', ms?.games === 10);
close('measured mean', ms?.mean ?? NaN, 80, 1e-9);
close('measured sd', ms?.sd ?? NaN, 21.08, 0.01);
const msFloor = measurePlayer(synth.filter((g) => g.player_id === '00-1'), def, { minOpportunities: 20 });
ok('opportunity floor excludes all', msFloor === null);

console.log('market defs');
ok('7 markets', PROP_MARKETS.length === 7);
ok('yardage markets default lognormal', ['rush_yds', 'rec_yds'].every((k) => marketByKey(k)?.defaultDist === 'lognormal'));
ok('pass yds defaults normal', marketByKey('pass_yds')?.defaultDist === 'normal');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
