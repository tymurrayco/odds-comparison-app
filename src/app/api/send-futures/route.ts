// src/app/api/send-futures/route.ts
// Posts a league's futures board to Discord as a formatted table.
//
// Per-league channels are opt-in via env vars; anything unset falls back to the
// general DISCORD_WEBHOOK_URL:
//   DISCORD_WEBHOOK_URL_NCAAF, _NFL, _NBA, _NCAAB, _MLB, _NHL, _WNBA, _MLS, _EPL
//
// POST body: { sport: string, limit?: number }
//   sport — the-odds-api key, e.g. "americanfootball_ncaaf"
//   limit — teams to list (default 25, max 100; Discord caps a description at
//           4096 chars and a line runs ~34, so ~100 is the true ceiling)
import { NextRequest, NextResponse } from 'next/server';
import { MARKET_TITLES, getTopFutures, attachEspnAssets } from '@/lib/futuresShare';
import { embedColor } from '@/lib/betShare';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// odds-api sport key -> env var suffix
const LEAGUE_SUFFIX: Record<string, string> = {
  americanfootball_ncaaf: 'NCAAF',
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  basketball_ncaab: 'NCAAB',
  baseball_mlb: 'MLB',
  icehockey_nhl: 'NHL',
  basketball_wnba: 'WNBA',
  soccer_usa_mls: 'MLS',
  soccer_epl: 'EPL',
};

const BOOK_SHORT: Record<string, string> = {
  DraftKings: 'DK', FanDuel: 'FD', BetMGM: 'MGM', BetRivers: 'BR',
  Caesars: 'CZR', Kalshi: 'KAL',
};

// Label strategy per league, tuned to keep lines short on mobile Discord:
//   'abbrev'  — "DEN Broncos": pro leagues share cities (NY/LA), so the
//               abbreviation disambiguates and stays compact.
//   'mascot'  — "Golden Knights": NHL mascots are unique league-wide and its
//               names run long, so the abbreviation is wasted width.
//   'school'  — "Ohio State": college is one team per school, and the mascots
//               there are the long ones ("Fighting Irish").
// Verified 2026-07-26: NHL/NBA/MLB/WNBA mascots are unique league-wide (no
// duplicates), so the city/abbrev is wasted width there. NFL keeps 'abbrev'
// because its mascots are short and the shared-city teams (NYG/NYJ, LAR/LAC)
// read better with it. MLS mascots are the longest of any league ("New England
// Revolution", 22 chars) and its `name` already carries the city, so 'school'
// (ESPN location) is the compact choice there.
const LABEL_STYLE: Record<string, 'abbrev' | 'mascot' | 'school'> = {
  americanfootball_nfl: 'abbrev',
  icehockey_nhl: 'mascot',
  basketball_nba: 'mascot',
  baseball_mlb: 'mascot',
  basketball_wnba: 'mascot',
  soccer_usa_mls: 'school',
  americanfootball_ncaaf: 'school',
  basketball_ncaab: 'school',
  soccer_epl: 'school',
};

function webhookFor(sport: string): string | undefined {
  const suffix = LEAGUE_SUFFIX[sport];
  return (
    (suffix ? process.env[`DISCORD_WEBHOOK_URL_${suffix}`] : undefined) ||
    process.env.DISCORD_WEBHOOK_URL
  );
}

export async function GET() {
  const configured = Object.values(LEAGUE_SUFFIX).reduce<Record<string, boolean>>(
    (acc, suffix) => {
      acc[suffix] = Boolean(process.env[`DISCORD_WEBHOOK_URL_${suffix}`]);
      return acc;
    },
    {}
  );
  return NextResponse.json({
    generalConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL),
    perLeagueConfigured: configured,
  });
}

export async function POST(request: NextRequest) {
  try {
    const { sport, limit } = await request.json();
    if (!sport || !MARKET_TITLES[sport]) {
      return NextResponse.json({ error: 'Unknown or unsupported sport key' }, { status: 400 });
    }
    const webhook = webhookFor(sport);
    if (!webhook) {
      return NextResponse.json(
        { error: `No Discord webhook configured (set DISCORD_WEBHOOK_URL_${LEAGUE_SUFFIX[sport] ?? '…'} or DISCORD_WEBHOOK_URL)` },
        { status: 500 }
      );
    }

    const count = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const all = await getTopFutures(sport);
    if (all.length === 0) {
      return NextResponse.json({ error: 'No futures prices available right now' }, { status: 404 });
    }
    const shown = all.slice(0, count);
    // Attach for every row: the leader supplies the accent + thumbnail, and
    // each row uses ESPN's school name so mascots don't wrap on mobile.
    // Single (24h-cached) teams fetch regardless of row count.
    await attachEspnAssets(sport, shown);

    // Ratio format: +3500 -> "35:1", +650 -> "6.5:1". Odds-on favorites
    // (negative American) invert: -150 -> "1:1.5".
    const fmt = (o: number) => {
      if (o > 0) {
        const x = o / 100;
        return `${Number.isInteger(x) ? x : x.toFixed(1)}:1`;
      }
      const y = Math.abs(o) / 100;
      return `1:${Number.isInteger(y) ? y : y.toFixed(1)}`;
    };
    // Keep lines short enough to avoid wrapping in Discord's mobile code block
    const style = LABEL_STYLE[sport] ?? 'school';
    const label = (t: { school?: string; abbrev?: string; mascot?: string; name: string }) => {
      if (style === 'mascot' && t.mascot) return t.mascot;
      if (style === 'abbrev' && t.abbrev && t.mascot) return `${t.abbrev} ${t.mascot}`;
      return t.school || t.name;
    };
    const width = Math.min(Math.max(...shown.map(t => label(t).length)), 20);
    const lines = shown.map((t, i) => {
      const rank = String(i + 1).padStart(2, ' ');
      const raw = label(t);
      const name = (raw.length > width ? raw.slice(0, width - 1) + '…' : raw).padEnd(width);
      const odds = fmt(t.odds).padStart(7);
      const book = t.book ? ` ${BOOK_SHORT[t.book] ?? t.book}` : '';
      return `${rank}. ${name} ${odds}${book}`;
    });

    const title = MARKET_TITLES[sport];
    const leader = shown[0];
    const embed = {
      title: `📊  ${title}`,
      url: `https://www.odds.day/futures/${sport}`,
      description: '```\n' + lines.join('\n') + '\n```',
      color: embedColor(leader?.color ?? null),
      // Leader's logo goes in the AUTHOR slot, not `thumbnail`: a thumbnail sits
      // beside the description and narrows it, which wrapped every line of the
      // table on mobile. The author row sits above and costs no width.
      // Dark-variant logo because Discord embeds render on a dark surface.
      ...(leader
        ? {
            author: {
              name: `${label(leader)} favorite`,
              ...(leader.logo
                ? { icon_url: leader.logo.replace('/500/', '/500-dark/') }
                : {}),
            },
          }
        : {}),
      footer: {
        text: `Best price across DK · FD · MGM · BR · CZR · Kalshi — showing ${shown.length} of ${all.length} · odds.day`,
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
      throw new Error(`Discord webhook failed: ${resp.status} ${detail.slice(0, 200)}`);
    }

    return NextResponse.json({
      success: true,
      sport,
      shown: shown.length,
      total: all.length,
      channel: LEAGUE_SUFFIX[sport] && process.env[`DISCORD_WEBHOOK_URL_${LEAGUE_SUFFIX[sport]}`]
        ? `league (${LEAGUE_SUFFIX[sport]})`
        : 'general',
    });
  } catch (error) {
    console.error('Error sending futures:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send futures' },
      { status: 500 }
    );
  }
}
