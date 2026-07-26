// src/app/api/send-bet/route.ts
// Posts a tracked bet straight to Discord's webhook — no Zapier in the middle.
// Builds a rich embed (team color, logo, odds/units/book fields, share card
// image) rather than relying on Discord to unfurl a link.
//
// Env:
//   DISCORD_WEBHOOK_URL  — target channel webhook (primary path)
//   ZAPIER_WEBHOOK_URL   — optional; still forwarded when set, for any other
//                          Zaps that depend on it. Neither is required.
import { NextRequest, NextResponse } from 'next/server';
import {
  ShareBet, wageredTeam, getTeamAssets, buildBetOgUrl, formatOdds, embedColor,
} from '@/lib/betShare';

const STATUS_EMOJI: Record<string, string> = {
  pending: '🎟️', won: '✅', lost: '❌', push: '➖',
};

// Read-only config check — confirms a destination is wired without posting
// anything or revealing the webhook URL. Vercel env changes need a redeploy,
// so this is the quick way to tell whether prod actually has it.
export async function GET() {
  return NextResponse.json({
    discordConfigured: Boolean(process.env.DISCORD_WEBHOOK_URL),
    zapierConfigured: Boolean(process.env.ZAPIER_WEBHOOK_URL),
  });
}

export async function POST(request: NextRequest) {
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  const zapierUrl = process.env.ZAPIER_WEBHOOK_URL;

  if (!discordUrl && !zapierUrl) {
    return NextResponse.json(
      { error: 'No destination configured (set DISCORD_WEBHOOK_URL)' },
      { status: 500 }
    );
  }

  try {
    const bet: ShareBet = await request.json();
    const team = wageredTeam(bet);
    const { logo, color } = await getTeamAssets(bet.league, team);
    const shareUrl = bet.id ? `https://www.odds.day/bet/${bet.id}` : 'https://www.odds.day';
    const oddsStr = formatOdds(bet.odds);
    const emoji = STATUS_EMOJI[bet.status] ?? '🎟️';
    const eventDate = bet.event_date ?? bet.eventDate;

    const results: Record<string, string> = {};

    if (discordUrl) {
      const embed = {
        title: `${emoji}  ${bet.bet}`,
        url: shareUrl,
        description: [
          bet.description && (bet.bet_type ?? bet.betType) !== 'future' ? `**${bet.description}**` : null,
          [bet.league, eventDate
            ? new Date(eventDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
              })
            : null].filter(Boolean).join(' · '),
        ].filter(Boolean).join('\n'),
        color: embedColor(color),
        // No odds/units/book fields — the share card image already shows them
        ...(logo ? { thumbnail: { url: logo } } : {}),
        image: { url: buildBetOgUrl(bet, logo, color) },
        footer: { text: 'odds.day' },
        timestamp: new Date().toISOString(),
      };

      const resp = await fetch(discordUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`Discord webhook failed: ${resp.status} ${detail.slice(0, 200)}`);
      }
      results.discord = 'sent';
    }

    // Legacy path — only if still configured
    if (zapierUrl) {
      try {
        await fetch(zapierUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...bet,
            shareUrl,
            summary: [bet.bet, oddsStr, `${bet.stake}u`, bet.book].filter(Boolean).join(' · '),
          }),
        });
        results.zapier = 'sent';
      } catch {
        results.zapier = 'failed (non-fatal)';
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (error) {
    console.error('Error sending bet:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send bet' },
      { status: 500 }
    );
  }
}
