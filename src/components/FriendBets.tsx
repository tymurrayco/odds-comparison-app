// src/components/FriendBets.tsx
//
// The pieces behind the friend chips on a game card: the small account photo
// that sits on a chip's corner, the who-bet-what list a chip opens, and
// "Tail" — the same bet at the best price on the board right now, handed to
// the bet ticket.
'use client';

import { useState } from 'react';
import type { Game } from '@/lib/api';
import { bookByTitle, goUrl } from '@/lib/books';
import { formatOdds } from '@/lib/utils';
import type { Profile } from '@/lib/social';
import { gameSide, type FriendBet } from '@/lib/friendBets';
import type { TicketPick } from './BetTicket';
import { getLeagueDisplayName, getSportFromLeague } from './OddsTable';
import LiveTag from './LiveTag';

const AVATAR_COLORS = ['#ea580c', '#7c3aed', '#0891b2', '#db2777', '#059669', '#ca8a04'];

/** Round account photo; a coloured initial when there is none or it fails to load. */
export function FriendAvatar({ profile, className }: { profile: Profile; className: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (profile.displayName || profile.handle || '?').trim().charAt(0).toUpperCase();
  const color = AVATAR_COLORS[[...profile.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return profile.avatarUrl && !failed ? (
    // Plain <img> + no-referrer: same reasons as the account button
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.avatarUrl}
      alt=""
      referrerPolicy="no-referrer"
      className={`${className} rounded-full bg-gray-100 object-cover`}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className={`${className} inline-flex items-center justify-center rounded-full font-bold leading-none text-white`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  );
}

/**
 * The same full-game bet at the best price on the board now: best number
 * first, then best price, among the visitor's selected books. null when the
 * bet isn't a full-game spread / moneyline / total or no book prices it.
 */
export function tailPick(friend: FriendBet, game: Game, selectedBookmakers?: string[]): TicketPick | null {
  const side = gameSide(friend.bet, game.away_team, game.home_team);
  if (!side) return null;
  const marketKey = side.betType === 'spread' ? 'spreads' : side.betType === 'moneyline' ? 'h2h' : 'totals';
  const outcomeName = side.betType === 'total' ? side.totalType : side.team;
  // A lower number is the better one only for an Over
  const lineSign = side.betType === 'total' && side.totalType === 'Over' ? -1 : 1;

  let best: { book: string; price: number; point?: number; link?: string } | null = null;
  for (const bm of game.bookmakers) {
    if (selectedBookmakers?.length && !selectedBookmakers.includes(bm.title)) continue;
    const market = bm.markets.find((m) => m.key === marketKey);
    const outcome = market?.outcomes.find((o) => o.name === outcomeName);
    if (!outcome) continue;
    if (side.betType !== 'moneyline' && outcome.point === undefined) continue;
    const line = (outcome.point ?? 0) * lineSign;
    const bestLine = (best?.point ?? 0) * lineSign;
    if (!best || line > bestLine || (line === bestLine && outcome.price > best.price)) {
      best = { book: bm.title, price: outcome.price, point: outcome.point, link: outcome.link ?? market?.link ?? bm.link };
    }
  }
  if (!best) return null;

  const { book, price, point, link } = best;
  const title =
    side.betType === 'spread'
      ? `${side.team} ${point! > 0 ? '+' : ''}${point}`
      : side.betType === 'total'
        ? `${side.totalType} ${point}`
        : `${side.team} ML`;
  const matchup = `${game.away_team} @ ${game.home_team}`;
  // Event date in local time (toISOString would shift late games a day)
  const d = new Date(game.commence_time);
  const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const logo = bookByTitle(book)?.logo;
  return {
    title,
    subtitle: matchup,
    odds: price,
    book,
    bookLogo: logo ? `/bookmaker-logos/${logo}` : undefined,
    link,
    buildGo: (to) => goUrl({ book, sport: game.sport_key, game: game.id, market: marketKey, outcome: outcomeName, to }),
    commenceTime: game.commence_time,
    draft: {
      date: new Date().toISOString().split('T')[0],
      eventDate,
      sport: getSportFromLeague(game.sport_key),
      league: getLeagueDisplayName(game.sport_key),
      description: matchup,
      awayTeam: game.away_team,
      homeTeam: game.home_team,
      team: side.betType === 'total' ? undefined : side.team,
      betType: side.betType,
      bet: title,
      odds: price,
      status: 'pending',
      book,
      notes: `Tailing ${friend.owner.displayName || `@${friend.owner.handle}`}`,
    },
  };
}

/** Who bet what, opened from a friend chip: person, bet, price, book, stake, and Tail. */
export function FriendBetsPanel({
  entries,
  game,
  selectedBookmakers,
  onTail,
}: {
  entries: FriendBet[];
  game: Game;
  selectedBookmakers?: string[];
  onTail: (pick: TicketPick) => void;
}) {
  return (
    <div className="mt-1.5 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600">
      {entries.map((f) => {
        const pick = tailPick(f, game, selectedBookmakers);
        return (
          <div key={f.bet.id} className="flex items-center gap-2 py-1.5">
            <FriendAvatar profile={f.owner} className="h-6 w-6 flex-none text-[10px]" />
            <div className="min-w-0 flex-1 leading-snug">
              <div className="truncate">
                <span className="font-semibold text-slate-800">{f.owner.displayName || `@${f.owner.handle}`}</span> · {f.bet.bet} ({formatOdds(f.bet.odds)})
              </div>
              <div className="truncate text-[11px] text-slate-400">
                {f.bet.live && <LiveTag className="mr-1 align-middle" />}
                {[f.bet.book, `${+f.bet.stake.toFixed(2)}u`].filter(Boolean).join(' · ')}
              </div>
            </div>
            {pick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTail(pick);
                }}
                title={`${pick.title} (${formatOdds(pick.odds)}) at ${pick.book} — best price now`}
                className="flex-none rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
              >
                Tail
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
