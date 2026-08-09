// src/lib/props/nflverse.ts
// Fetch + parse nflverse weekly player stats into game-log rows.
// Source: github.com/nflverse/nflverse-data release tag `stats_player`,
// asset `stats_player_week_{season}.csv` (updated nightly in season).

import { PlayerGameLog } from './markets';

const ASSET_URL = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

const KEEP_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'FB']);

/** Minimal CSV parser handling quoted fields (headshot URLs embed commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === '' || s === 'NA') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Parse the weekly stats CSV into filtered game-log rows. */
export function parseWeeklyStats(csv: string): PlayerGameLog[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);

  const idx = {
    player_id: col('player_id'),
    player_display_name: col('player_display_name'),
    position: col('position'),
    season: col('season'),
    week: col('week'),
    season_type: col('season_type'),
    team: col('team'),
    opponent_team: col('opponent_team'),
    completions: col('completions'),
    attempts: col('attempts'),
    passing_yards: col('passing_yards'),
    passing_tds: col('passing_tds'),
    passing_interceptions: col('passing_interceptions'),
    carries: col('carries'),
    rushing_yards: col('rushing_yards'),
    rushing_tds: col('rushing_tds'),
    receptions: col('receptions'),
    targets: col('targets'),
    receiving_yards: col('receiving_yards'),
    receiving_tds: col('receiving_tds'),
  };
  const required = ['player_id', 'player_display_name', 'position', 'season', 'week', 'season_type', 'team'] as const;
  for (const k of required) {
    if (idx[k] === -1) throw new Error(`nflverse CSV missing column: ${k}`);
  }

  const out: PlayerGameLog[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const position = row[idx.position];
    if (!KEEP_POSITIONS.has(position)) continue;
    const seasonType = row[idx.season_type];
    if (seasonType !== 'REG' && seasonType !== 'POST') continue;

    const attempts = num(row[idx.attempts]);
    const carries = num(row[idx.carries]);
    const targets = num(row[idx.targets]);
    // Skip pure special-teams / no-touch rows
    if (!(attempts || carries || targets)) continue;

    out.push({
      player_id: row[idx.player_id],
      player_name: row[idx.player_display_name],
      position,
      team: row[idx.team],
      opponent: row[idx.opponent_team] || null,
      season: Number(row[idx.season]),
      week: Number(row[idx.week]),
      season_type: seasonType,
      completions: num(row[idx.completions]),
      attempts,
      passing_yards: num(row[idx.passing_yards]),
      passing_tds: num(row[idx.passing_tds]),
      interceptions: num(row[idx.passing_interceptions]),
      carries,
      rushing_yards: num(row[idx.rushing_yards]),
      rushing_tds: num(row[idx.rushing_tds]),
      receptions: num(row[idx.receptions]),
      targets,
      receiving_yards: num(row[idx.receiving_yards]),
      receiving_tds: num(row[idx.receiving_tds]),
    });
  }
  return out;
}

/** Download one season's weekly stats. Throws with a clear message on 404. */
export async function fetchSeasonLogs(season: number): Promise<PlayerGameLog[]> {
  const res = await fetch(ASSET_URL(season), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No nflverse data for ${season} yet (file appears once the season starts)`
        : `nflverse download failed: HTTP ${res.status}`
    );
  }
  return parseWeeklyStats(await res.text());
}
