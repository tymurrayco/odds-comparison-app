// Resolve an odds-board team name (The Odds API naming) to an ESPN team entry.
//
// The Odds API and ESPN disagree on a handful of college names every week:
//   "Sam Houston State Bearkats"        vs ESPN "Sam Houston Bearkats"
//   "Southern Mississippi Golden Eagles" vs ESPN "Southern Miss Golden Eagles"
//   "Grambling State Tigers"            vs ESPN "Grambling Tigers"
//   "Southern University Jaguars"       vs ESPN "Southern Jaguars"
//   "San Jose State Spartans"           vs ESPN "San José State Spartans"
//   "UMass Minutemen"                   vs ESPN "Massachusetts Minutemen"
//   "Appalachian State Mountaineers"    vs ESPN "App State Mountaineers"
// Exact matching on ESPN's display/short/nickname/location fields missed all
// seven (team page 404 "Unknown team", 2026-09-07). Passes, in order:
//   1. exact match on any ESPN variant (accent-folded), including
//      "<nickname> <mascot>" so "UMass Minutemen" resolves;
//   2. the same with " State"/" University" dropped from the odds name;
//   3. mascot + city: the odds name ends with the ESPN mascot AND the ESPN
//      location starts with the odds name's first word — only when unique;
//   4. a tiny alias table for names no rule covers (App State).

export interface EspnTeamLike {
  id: string | number;
  displayName?: string | null;
  shortDisplayName?: string | null;
  nickname?: string | null;
  abbreviation?: string | null;
  location?: string | null;
  name?: string | null; // mascot ("Bearkats")
}

const ALIASES: Record<string, string> = {
  'appalachian state': 'app state',
};

export const foldTeamName = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function variantsOf(t: EspnTeamLike): string[] {
  const out: (string | null | undefined)[] = [
    t.displayName,
    t.shortDisplayName,
    t.nickname,
    t.abbreviation,
    t.location,
    t.location && t.nickname ? `${t.location} ${t.nickname}` : null,
    t.location && t.name ? `${t.location} ${t.name}` : null,
    t.nickname && t.name ? `${t.nickname} ${t.name}` : null,
    t.shortDisplayName && t.name ? `${t.shortDisplayName} ${t.name}` : null,
  ];
  return out.filter((v): v is string => !!v);
}

function exactMatch(teams: EspnTeamLike[], want: string): EspnTeamLike | null {
  const key = foldTeamName(want);
  if (!key) return null;
  for (const t of teams) {
    if (variantsOf(t).some((v) => foldTeamName(v) === key)) return t;
  }
  return null;
}

export function matchEspnTeam(team: string, teams: EspnTeamLike[]): EspnTeamLike | null {
  const raw = team.trim();
  if (!raw) return null;

  // 1. exact
  const direct = exactMatch(teams, raw);
  if (direct) return direct;

  // 4a. alias (applied early so the alias can then go through exact matching)
  const lower = raw.toLowerCase();
  for (const [from, to] of Object.entries(ALIASES)) {
    if (lower.startsWith(from)) {
      const aliased = exactMatch(teams, to + raw.slice(from.length));
      if (aliased) return aliased;
    }
  }

  // 2. drop " State" / " University"
  for (const re of [/\bState\b\s*/i, /\bUniversity\b\s*/i]) {
    if (re.test(raw)) {
      const stripped = exactMatch(teams, raw.replace(re, '').replace(/\s+/g, ' ').trim());
      if (stripped) return stripped;
    }
  }

  // 3. mascot + city, unique
  const key = foldTeamName(raw);
  const firstWord = foldTeamName(raw.split(/\s+/)[0] ?? '');
  const cands = teams.filter((t) => {
    if (!t.name || !t.location) return false;
    const mascot = foldTeamName(t.name);
    return mascot.length >= 4 && key.endsWith(mascot) && foldTeamName(t.location).startsWith(firstWord);
  });
  if (cands.length === 1) return cands[0];

  return null;
}
