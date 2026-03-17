// 2026 NCAA Tournament field (68 teams) from Selection Sunday
// Source: torvik-tournament-dataset.csv / Wikipedia bracket
//
// Template region mapping (determines Final Four pairings):
//   Region 1 (seeds 1-16)  = South   ──┐ Semi 1
//   Region 2 (seeds 17-32) = East    ──┘
//   Region 3 (seeds 33-48) = West    ──┐ Semi 2
//   Region 4 (seeds 49-64) = Midwest ──┘
//
// First Four play-in games (round 0):
//   R0-G1: South 16 — seed 16 vs 65
//   R0-G2: West 11  — seed 43 vs 66
//   R0-G3: Midwest 11 — seed 59 vs 67
//   R0-G4: Midwest 16 — seed 64 vs 68

export const NCAA_2026_REGION_NAMES = ['South', 'East', 'West', 'Midwest', 'First Four'];

interface NCAATournamentEntry {
  team: string;
  region: 'South' | 'East' | 'West' | 'Midwest';
  seed: number;         // 1-16 within region (display seed)
  overallSeed: number;  // 1-68 (template seed)
}

// Region offset: South=0, East=16, West=32, Midwest=48
const REGION_OFFSET: Record<string, number> = {
  South: 0,
  East: 16,
  West: 32,
  Midwest: 48,
};

// First Four alternates get seeds 65-68
// These pair with the "primary" team in the play-in round
const FIRST_FOUR: { team: string; region: string; regionSeed: number; overallSeed: number }[] = [
  { team: 'Prairie View A&M', region: 'South', regionSeed: 16, overallSeed: 65 },
  { team: 'Texas', region: 'West', regionSeed: 11, overallSeed: 66 },
  { team: 'Miami OH', region: 'Midwest', regionSeed: 11, overallSeed: 67 },
  { team: 'UMBC', region: 'Midwest', regionSeed: 16, overallSeed: 68 },
];

function entry(team: string, region: 'South' | 'East' | 'West' | 'Midwest', seed: number): NCAATournamentEntry {
  return { team, region, seed, overallSeed: REGION_OFFSET[region] + seed };
}

export const NCAA_2026_FIELD: NCAATournamentEntry[] = [
  // === SOUTH (Region 1, seeds 1-16) ===
  entry('Florida', 'South', 1),
  entry('Houston', 'South', 2),
  entry('Illinois', 'South', 3),
  entry('Nebraska', 'South', 4),
  entry('Vanderbilt', 'South', 5),
  entry('North Carolina', 'South', 6),
  entry('Saint Mary\'s', 'South', 7),
  entry('Clemson', 'South', 8),
  entry('Iowa', 'South', 9),
  entry('Texas A&M', 'South', 10),
  entry('VCU', 'South', 11),
  entry('McNeese St.', 'South', 12),
  entry('Troy', 'South', 13),
  entry('Penn', 'South', 14),
  entry('Idaho', 'South', 15),
  entry('Lehigh', 'South', 16), // First Four vs Prairie View A&M

  // === EAST (Region 2, seeds 17-32) ===
  entry('Duke', 'East', 1),
  entry('Connecticut', 'East', 2),
  entry('Michigan St.', 'East', 3),
  entry('Kansas', 'East', 4),
  entry('St. John\'s', 'East', 5),
  entry('Louisville', 'East', 6),
  entry('UCLA', 'East', 7),
  entry('Ohio St.', 'East', 8),
  entry('TCU', 'East', 9),
  entry('UCF', 'East', 10),
  entry('South Florida', 'East', 11),
  entry('Northern Iowa', 'East', 12),
  entry('Cal Baptist', 'East', 13),
  entry('North Dakota St.', 'East', 14),
  entry('Furman', 'East', 15),
  entry('Siena', 'East', 16),

  // === WEST (Region 3, seeds 33-48) ===
  entry('Arizona', 'West', 1),
  entry('Purdue', 'West', 2),
  entry('Gonzaga', 'West', 3),
  entry('Arkansas', 'West', 4),
  entry('Wisconsin', 'West', 5),
  entry('BYU', 'West', 6),
  entry('Miami FL', 'West', 7),
  entry('Villanova', 'West', 8),
  entry('Utah St.', 'West', 9),
  entry('Missouri', 'West', 10),
  entry('N.C. State', 'West', 11), // First Four vs Texas
  entry('High Point', 'West', 12),
  entry('Hawaii', 'West', 13),
  entry('Kennesaw St.', 'West', 14),
  entry('Queens', 'West', 15),
  entry('LIU', 'West', 16),

  // === MIDWEST (Region 4, seeds 49-64) ===
  entry('Michigan', 'Midwest', 1),
  entry('Iowa St.', 'Midwest', 2),
  entry('Virginia', 'Midwest', 3),
  entry('Alabama', 'Midwest', 4),
  entry('Texas Tech', 'Midwest', 5),
  entry('Tennessee', 'Midwest', 6),
  entry('Kentucky', 'Midwest', 7),
  entry('Georgia', 'Midwest', 8),
  entry('Saint Louis', 'Midwest', 9),
  entry('Santa Clara', 'Midwest', 10),
  entry('SMU', 'Midwest', 11), // First Four vs Miami OH
  entry('Akron', 'Midwest', 12),
  entry('Hofstra', 'Midwest', 13),
  entry('Wright St.', 'Midwest', 14),
  entry('Tennessee St.', 'Midwest', 15),
  entry('Howard', 'Midwest', 16), // First Four vs UMBC
];

/**
 * Build the pre-seeded team list for the 2026 NCAA Tournament.
 * Returns 68 BracketTeam objects with correct overall seeds and display seeds.
 */
export function buildNCAA2026Teams(
  ratings: { teamName: string; rating: number; conference?: string }[],
  getTeamLogo: (teamName: string) => string | null,
): { teamName: string; seed: number; rating: number; conference: string; logoUrl: string | null; displaySeed: number }[] {
  const ratingMap = new Map<string, { rating: number; conference: string }>();
  for (const r of ratings) {
    ratingMap.set(r.teamName, { rating: r.rating, conference: r.conference || '' });
  }

  // Main field (64 teams, seeds 1-64)
  const result = NCAA_2026_FIELD.map(e => {
    const ratingData = ratingMap.get(e.team);
    return {
      teamName: e.team,
      seed: e.overallSeed,
      rating: ratingData?.rating ?? 0,
      conference: ratingData?.conference ?? '',
      logoUrl: getTeamLogo(e.team),
      displaySeed: e.seed,
    };
  });

  // First Four alternates (seeds 65-68)
  for (const ff of FIRST_FOUR) {
    const ratingData = ratingMap.get(ff.team);
    result.push({
      teamName: ff.team,
      seed: ff.overallSeed,
      rating: ratingData?.rating ?? 0,
      conference: ratingData?.conference ?? '',
      logoUrl: getTeamLogo(ff.team),
      displaySeed: ff.regionSeed,
    });
  }

  // Sort by overall seed
  result.sort((a, b) => a.seed - b.seed);
  return result;
}
