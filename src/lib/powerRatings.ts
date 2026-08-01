// src/lib/powerRatings.ts
// Shared types + paste-parser for NCAAF power rating sets (Brad Powers etc.)

export interface PowerRatingRow {
  rank: number | null;
  team: string;
  lastYr: number | null;
  thisYr: number;
  conference: string | null;
}

export interface PowerRatingSet {
  id: number;
  sport: string;
  source: string;
  source_label: string;
  season: number;
  as_of: string | null;
  ratings: PowerRatingRow[];
  created_at: string;
  updated_at: string;
}

export function slugifySource(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_ALIASES: Record<string, keyof PowerRatingRow> = {
  rank: 'rank', rk: 'rank',
  team: 'team', school: 'team', name: 'team',
  rating: 'thisYr', thisyr: 'thisYr', this_yr: 'thisYr', current: 'thisYr', power: 'thisYr',
  lastyr: 'lastYr', last_yr: 'lastYr', prev: 'lastYr', previous: 'lastYr', last: 'lastYr',
  conference: 'conference', conf: 'conference',
};

function cleanCell(s: string): string {
  // strip BOM + non-printable chars (CSV import lesson: BOM stripping alone isn't enough)
  return s.replace(/[^\x20-\x7E]/g, '').trim();
}

function toNum(s: string): number | null {
  const n = parseFloat(s.replace(/[+]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse pasted ratings text into rows. Auto-detects tab vs comma delimiter.
 * Accepts a header row (Team, Rating, LastYr, Conference in any order) or
 * positional cells: [rank?, ] team, thisYr [, lastYr] [, conference].
 */
export function parseRatingsPaste(text: string): { rows: PowerRatingRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ['No lines to parse'] };

  const delim = lines[0].includes('\t') ? '\t' : ',';
  let headerMap: (keyof PowerRatingRow | null)[] | null = null;
  let startIdx = 0;

  const firstCells = lines[0].split(delim).map(cleanCell);
  if (firstCells.some((c) => HEADER_ALIASES[c.toLowerCase().replace(/\s+/g, '')] === 'team')) {
    headerMap = firstCells.map((c) => HEADER_ALIASES[c.toLowerCase().replace(/\s+/g, '')] ?? null);
    startIdx = 1;
  }

  const rows: PowerRatingRow[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(delim).map(cleanCell).filter((c) => c !== '');
    if (!cells.length) continue;

    const row: Partial<PowerRatingRow> = {};
    if (headerMap) {
      headerMap.forEach((key, idx) => {
        if (!key || cells[idx] === undefined) return;
        if (key === 'team' || key === 'conference') {
          row[key] = cells[idx];
        } else {
          const n = toNum(cells[idx]);
          if (n !== null) row[key] = n;
        }
      });
    } else {
      // positional: optional leading rank, then team, then numbers (thisYr, lastYr), trailing conference
      let idx = 0;
      const maybeRank = toNum(cells[0]);
      if (cells.length > 2 && maybeRank !== null && Number.isInteger(maybeRank) && toNum(cells[1]) === null) {
        row.rank = maybeRank;
        idx = 1;
      }
      row.team = cells[idx++];
      const nums: number[] = [];
      let conference: string | null = null;
      for (; idx < cells.length; idx++) {
        const n = toNum(cells[idx]);
        if (n !== null) nums.push(n);
        else conference = cells[idx];
      }
      if (nums.length) row.thisYr = nums[0];
      if (nums.length > 1) row.lastYr = nums[1];
      row.conference = conference;
    }

    if (!row.team || typeof row.thisYr !== 'number' || !Number.isFinite(row.thisYr)) {
      errors.push(`Line ${i + 1}: needs a team name and a rating ("${lines[i].slice(0, 40)}")`);
      continue;
    }
    rows.push({
      rank: row.rank ?? null,
      team: row.team,
      lastYr: row.lastYr ?? null,
      thisYr: row.thisYr,
      conference: row.conference ?? null,
    });
  }

  // sort by rating desc and fill missing ranks
  rows.sort((a, b) => (a.rank !== null && b.rank !== null ? a.rank - b.rank : b.thisYr - a.thisYr));
  rows.forEach((r, i) => { if (r.rank === null) r.rank = i + 1; });

  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.team.toLowerCase())) errors.push(`Duplicate team: ${r.team}`);
    seen.add(r.team.toLowerCase());
  }

  return { rows, errors };
}
