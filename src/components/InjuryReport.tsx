// src/components/InjuryReport.tsx
// Two-column NFL injury report shown inside a game card (🏥 toggle).
// Data: /api/injuries (ESPN league-wide feed, cached 30 min server-side).
import { useEffect, useState } from 'react';

interface InjuryEntry {
  name: string;
  position: string;
  status: string;
  comment: string | null;
  date: string | null;
  depthRank: number | null; // 1 = starter, 2 = backup, null = off depth chart
}

interface InjuryReportProps {
  awayTeam: string;
  homeTeam: string;
}

// Module-level cache: one fetch per page load serves every expanded card.
let cachePromise: Promise<Record<string, InjuryEntry[]>> | null = null;
function loadInjuries(): Promise<Record<string, InjuryEntry[]>> {
  if (!cachePromise) {
    cachePromise = fetch('/api/injuries?league=nfl')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => d.teams ?? {})
      .catch(() => {
        cachePromise = null; // allow retry on next mount
        return {};
      });
  }
  return cachePromise;
}

// Severity ordering + chip colors. Anything unrecognized sorts last, gray.
const STATUS_RANK: Record<string, number> = {
  'out': 0, 'injured reserve': 0, 'physically unable to perform': 0, 'suspension': 0,
  'doubtful': 1,
  'questionable': 2,
  'day-to-day': 3, 'probable': 3,
};
function statusRank(s: string): number {
  return STATUS_RANK[s.toLowerCase()] ?? 4;
}
function statusChip(s: string): string {
  const r = statusRank(s);
  if (r === 0) return 'bg-red-100 text-red-700';
  if (r === 1) return 'bg-orange-100 text-orange-700';
  if (r === 2) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}
// Compact chip label: "Injured Reserve" -> "IR", "Questionable" -> "Q", etc.
function statusLabel(s: string): string {
  const l = s.toLowerCase();
  if (l === 'injured reserve') return 'IR';
  if (l === 'physically unable to perform') return 'PUP';
  if (l === 'questionable') return 'Q';
  if (l === 'doubtful') return 'D';
  return s;
}

// Relevance from the current depth chart. Starters always matter; backups
// matter at rotation positions (RB committees, WR/DL rotations, backup QB)
// but not for specialists; rank >= 3 and off-chart players are roster noise
// and are hidden entirely.
const SPECIALIST_POS = new Set(['PK', 'K', 'P', 'LS']);
function isRelevant(e: InjuryEntry): boolean {
  if (e.depthRank === 1) return true;
  if (e.depthRank === 2) return !SPECIALIST_POS.has(e.position);
  return false;
}

function TeamColumn({ team, entries }: { team: string; entries: InjuryEntry[] | undefined }) {
  const [showAll, setShowAll] = useState(false);
  const all = (entries ?? []).slice().sort(
    (a, b) =>
      (a.depthRank ?? 99) - (b.depthRank ?? 99) ||
      statusRank(a.status) - statusRank(b.status)
  );
  const relevant = all.filter(isRelevant);
  const hidden = all.length - relevant.length;
  const shown = showAll ? all : relevant;
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-gray-700 border-b border-gray-200 pb-1 mb-1.5">
        {team}
      </div>
      {all.length === 0 ? (
        <p className="text-[11px] text-gray-400">No players with an injury designation.</p>
      ) : shown.length === 0 ? (
        <p className="text-[11px] text-gray-400">No injuries of consequence.</p>
      ) : (
        <ul className="space-y-1">
          {shown.map((e, i) => (
            <li
              key={i}
              className={`flex items-baseline gap-1.5 text-[11px] leading-tight ${
                isRelevant(e) ? '' : 'opacity-50'
              }`}
            >
              <span
                className={`shrink-0 px-1 py-px rounded font-semibold ${statusChip(e.status)}`}
                title={e.status}
              >
                {statusLabel(e.status)}
              </span>
              <span className="font-medium text-gray-800 truncate" title={e.comment ?? undefined}>
                {e.name}
              </span>
              {e.position && <span className="text-gray-400 shrink-0">{e.position}</span>}
              {e.depthRank === 1 && (
                <span
                  className="shrink-0 px-1 py-px rounded bg-purple-100 text-purple-700 font-semibold"
                  title="Projected starter on the current depth chart"
                >
                  ★
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <button
          className="mt-1 text-[10px] text-gray-400 hover:text-gray-600 hover:underline"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Hide depth players' : `+ ${hidden} depth player${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}

export default function InjuryReport({ awayTeam, homeTeam }: InjuryReportProps) {
  const [teams, setTeams] = useState<Record<string, InjuryEntry[]> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadInjuries().then((t) => {
      if (!alive) return;
      if (Object.keys(t).length === 0) setFailed(true);
      else setTeams(t);
    });
    return () => { alive = false; };
  }, []);

  if (failed) {
    return <p className="p-3 text-[11px] text-gray-400">Injury report unavailable.</p>;
  }
  if (!teams) {
    return <p className="p-3 text-[11px] text-gray-400">Loading injuries…</p>;
  }

  // Odds API NFL names match ESPN displayName exactly ("Houston Texans");
  // loose fallback in case of a stray mismatch.
  const find = (name: string): InjuryEntry[] | undefined => {
    if (teams[name]) return teams[name];
    const n = name.toLowerCase();
    const key = Object.keys(teams).find(
      (k) => k.toLowerCase().includes(n) || n.includes(k.toLowerCase())
    );
    return key ? teams[key] : undefined;
  };

  return (
    <div className="p-3">
      <div className="grid grid-cols-2 gap-x-4">
        <TeamColumn team={awayTeam} entries={find(awayTeam)} />
        <TeamColumn team={homeTeam} entries={find(homeTeam)} />
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        Source: ESPN · updated ~30 min · ★ projected starter · 2-deep only, depth players hidden
      </p>
    </div>
  );
}
