// 2026 NIT field (32 teams) — 4 regions of 8
//
// Region mapping:
//   Region 1 (seeds 1-8)   = Auburn
//   Region 2 (seeds 9-16)  = Albuquerque
//   Region 3 (seeds 17-24) = Tulsa
//   Region 4 (seeds 25-32) = Winston-Salem
//
// Semis: Auburn vs Albuquerque, Tulsa vs Winston-Salem

export const NIT_2026_REGION_NAMES = ['Auburn', 'Albuquerque', 'Tulsa', 'Winston-Salem'];
export const NIT_REGION_SIZE = 8;

interface NITEntry {
  team: string;
  region: string;
  seed: number;         // 1-8 within region (display seed)
  overallSeed: number;  // 1-32 (template seed)
}

const REGION_OFFSET: Record<string, number> = {
  Auburn: 0,
  Albuquerque: 8,
  Tulsa: 16,
  'Winston-Salem': 24,
};

function entry(team: string, region: string, seed: number): NITEntry {
  return { team, region, seed, overallSeed: REGION_OFFSET[region] + seed };
}

export const NIT_2026_FIELD: NITEntry[] = [
  // === AUBURN REGION (seeds 1-8) ===
  entry('Auburn', 'Auburn', 1),
  entry('Nevada', 'Auburn', 2),
  entry('George Mason', 'Auburn', 3),
  entry('Seattle', 'Auburn', 4),
  entry('St. Thomas', 'Auburn', 5),
  entry('Liberty', 'Auburn', 6),
  entry('Murray St.', 'Auburn', 7),
  entry('South Alabama', 'Auburn', 8),

  // === ALBUQUERQUE REGION (seeds 9-16) ===
  entry('New Mexico', 'Albuquerque', 1),
  entry('California', 'Albuquerque', 2),
  entry('Colorado St.', 'Albuquerque', 3),
  entry('Utah Valley', 'Albuquerque', 4),
  entry('George Washington', 'Albuquerque', 5),
  entry('Saint Joseph\'s', 'Albuquerque', 6),
  entry('UIC', 'Albuquerque', 7),
  entry('Sam Houston St.', 'Albuquerque', 8),

  // === TULSA REGION (seeds 17-24) ===
  entry('Tulsa', 'Tulsa', 1),
  entry('Oklahoma St.', 'Tulsa', 2),
  entry('Wichita St.', 'Tulsa', 3),
  entry('UC Irvine', 'Tulsa', 4),
  entry('UNLV', 'Tulsa', 5),
  entry('Wyoming', 'Tulsa', 6),
  entry('Davidson', 'Tulsa', 7),
  entry('Stephen F. Austin', 'Tulsa', 8),

  // === WINSTON-SALEM REGION (seeds 25-32) ===
  entry('Wake Forest', 'Winston-Salem', 1),
  entry('Dayton', 'Winston-Salem', 2),
  entry('Yale', 'Winston-Salem', 3),
  entry('Illinois St.', 'Winston-Salem', 4),
  entry('Kent St.', 'Winston-Salem', 5),
  entry('UNC Wilmington', 'Winston-Salem', 6),
  entry('Bradley', 'Winston-Salem', 7),
  entry('Navy', 'Winston-Salem', 8),
];

/**
 * Build the pre-seeded team list for the 2026 NIT.
 */
export function buildNIT2026Teams(
  ratings: { teamName: string; rating: number; conference?: string }[],
  getTeamLogo: (teamName: string) => string | null,
): { teamName: string; seed: number; rating: number; conference: string; logoUrl: string | null; displaySeed: number }[] {
  const ratingMap = new Map<string, { rating: number; conference: string }>();
  for (const r of ratings) {
    ratingMap.set(r.teamName, { rating: r.rating, conference: r.conference || '' });
  }

  const result = NIT_2026_FIELD.map(e => {
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

  result.sort((a, b) => a.seed - b.seed);
  return result;
}
