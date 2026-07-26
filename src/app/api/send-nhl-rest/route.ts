// src/app/api/send-nhl-rest/route.ts
// Posts today's NHL rest mismatches to the NHL Discord channel.
//
// GET  — used by the Vercel cron (and safe to hit manually); skips silently
//        when there's nothing worth reporting, so off-season days stay quiet.
// POST — manual send from the admin panel; same output, but reports back when
//        there are no games so the button gives feedback.
//
// Env: DISCORD_WEBHOOK_URL_NHL, falling back to DISCORD_WEBHOOK_URL.
import { NextResponse } from 'next/server';
import { getNHLRestData, nhlToday } from '@/lib/nhlRestData';

const NHL_BLUE = 0x0b1c3a;

interface Side {
  label: string;   // "B2B" | "4in6" | "3in4" | "2d rest"
  weight: number;  // higher = more meaningful fatigue
}

// Weights follow what the 2025-26 season actually showed: a back-to-back side
// lost 56.8% of matchups and a 4-in-6 side 56.1%, while 3-in-4 was 53.5%.
// Pure rest-day gaps of 2+ measured 51.5% — a coin flip — so they are NOT
// reported on their own, only as context next to a real fatigue flag.
function fatigueOf(r: { isB2B: boolean; is4in6: boolean; is3in4: boolean; restDays: number }): Side | null {
  if (r.isB2B) return { label: 'B2B', weight: 3 };
  if (r.is4in6) return { label: '4in6', weight: 2 };
  if (r.is3in4) return { label: '3in4', weight: 1 };
  return null;
}

async function buildAndSend(manual: boolean) {
  const webhook = process.env.DISCORD_WEBHOOK_URL_NHL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: 'No Discord webhook configured (set DISCORD_WEBHOOK_URL_NHL)' },
      { status: 500 }
    );
  }

  const today = nhlToday();
  const games = (await getNHLRestData()).filter(g => g.gameDate === today);

  // Only games where exactly one side carries a fatigue flag — a mismatch.
  const spots = games
    .map(g => {
      const home = fatigueOf(g.homeRest);
      const away = fatigueOf(g.awayRest);
      if (!home && !away) return null;
      if (home && away) return null; // both tired — no edge either way
      const tiredIsHome = Boolean(home);
      const tired = (home ?? away)!;
      return {
        tiredTeam: tiredIsHome ? g.homeRest.teamAbbr : g.awayRest.teamAbbr,
        freshTeam: tiredIsHome ? g.awayRest.teamAbbr : g.homeRest.teamAbbr,
        freshRest: tiredIsHome ? g.awayRest.restDays : g.homeRest.restDays,
        tiredIsHome,
        flag: tired.label,
        weight: tired.weight,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.weight - a.weight);

  if (spots.length === 0) {
    if (manual) {
      return NextResponse.json({
        success: true,
        posted: false,
        reason: games.length === 0 ? 'no NHL games today' : 'no rest mismatches today',
      });
    }
    // Cron: stay quiet rather than posting "nothing today" every morning
    return NextResponse.json({ success: true, posted: false, games: games.length });
  }

  const width = Math.max(...spots.map(s => s.tiredTeam.length + s.freshTeam.length)) + 4;
  const lines = spots.map(s => {
    const matchup = s.tiredIsHome
      ? `${s.freshTeam} @ ${s.tiredTeam}`
      : `${s.tiredTeam} @ ${s.freshTeam}`;
    const restStr = s.freshRest >= 7 ? '7+d' : `${s.freshRest}d`;
    return `${matchup.padEnd(width)} ${s.tiredTeam} ${s.flag.padEnd(4)} vs ${restStr} rest`;
  });

  const embed = {
    author: { name: 'Rest advantage' },
    title: `🏒  NHL rest report — ${new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
    url: 'https://www.odds.day/?league=icehockey_nhl',
    description: '```\n' + lines.join('\n') + '\n```',
    color: NHL_BLUE,
    footer: {
      text: `${spots.length} fatigue mismatch${spots.length === 1 ? '' : 'es'} of ${games.length} games · B2B and 4in6 are the situations that historically matter · odds.day`,
    },
    timestamp: new Date().toISOString(),
  };

  const resp = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return NextResponse.json(
      { error: `Discord webhook failed: ${resp.status} ${detail.slice(0, 200)}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, posted: true, spots: spots.length, games: games.length });
}

export async function GET() {
  return buildAndSend(false);
}

export async function POST() {
  return buildAndSend(true);
}
