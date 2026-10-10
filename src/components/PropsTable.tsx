// src/components/PropsTable.tsx
//
// Player props for one game, drawn as a game card: the same title and time
// line as GameCard, the prop markets as chips (like Spread / ML / O/U) with
// one market's table open at a time, and the same price cells as OddsTable —
// tap a price for the bet ticket (signed in) or the sportsbook (signed out).
'use client';

import { Fragment, useRef, useState } from 'react';
import { ProcessedPropsMarket, ProcessedProp, PropsEvent, BOOKMAKERS } from '@/lib/api';
import { formatOdds } from '@/lib/utils';
import BetTicket, { type TicketPick } from '@/components/BetTicket';
import { getSportFromLeague, getLeagueDisplayName } from '@/components/OddsTable';
import { useUser } from '@/lib/userAuth';
import { usePrefs, zoneOption } from '@/lib/prefs';
import { openBetLink, markPriceTapped } from '@/lib/betLinks';
import { goUrl } from '@/lib/books';
import { useTeamColorMap, teamInfoFromMap, TeamLogoImg } from '@/lib/myGameBets';
import { cardTitleName, hasShortCardTitle } from '@/lib/teamNames';

const BOOKMAKER_LOGOS: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png',
  'Caesars': '/bookmaker-logos/caesars.png',
  'BetOnline.ag': '/bookmaker-logos/betonline.png',
  'Kalshi': '/bookmaker-logos/kalshi.png',
  'Novig': '/bookmaker-logos/novig.png',
  'ProphetX': '/bookmaker-logos/prophetx.png',
  'Polymarket': '/bookmaker-logos/polymarket.png',
};

const localLogo = (team: string) => `/team-logos/${team.toLowerCase().replace(/\s+/g, '')}.png`;

/**
 * A game's title and start time, the way a game card shows them: on phones
 * logo + short name ("Eagles @ Jaguars"), full names on wide screens, then
 * "Sun • 6:30 AM MST". Used by the props game list and the open game's card.
 */
export function PropsEventHeader({ event, league }: { event: PropsEvent; league: string }) {
  const prefs = usePrefs();
  const teamMap = useTeamColorMap(league);
  const zone = zoneOption(prefs.timeZone);

  // Same date rule as GameCard: the weekday through six days out, "Oct 17" beyond
  const start = new Date(event.commence_time);
  const calendarDay = (d: Date) => {
    const [y, m, day] = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...zone })
      .format(d)
      .split('-')
      .map(Number);
    return Date.UTC(y, m - 1, day) / 86_400_000;
  };
  const daysOut = calendarDay(start) - calendarDay(new Date());
  const date = start.toLocaleDateString(
    undefined,
    daysOut >= 0 && daysOut <= 6 ? { weekday: 'short', ...zone } : { month: 'short', day: 'numeric', ...zone }
  );
  const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...zone });
  const zoneAbbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short', ...zone })
    .formatToParts(start)
    .find((part) => part.type === 'timeZoneName')?.value || '';

  const side = (team: string) => {
    const info = teamInfoFromMap(teamMap, team);
    return (
      <>
        <TeamLogoImg srcs={[info?.logo, localLogo(team)]} className="h-5 w-5 flex-none object-contain" />
        <span className="truncate">{cardTitleName(league, team, info)}</span>
      </>
    );
  };

  return (
    <div className="min-w-0">
      <h3 className="text-[15px] md:text-[18px] font-semibold tracking-[-0.3px] md:tracking-[-0.45px] text-gray-900 truncate min-w-0">
        {hasShortCardTitle(league) ? (
          <>
            <span className="md:hidden flex items-center gap-1.5 min-w-0">
              {side(event.away_team)}
              <span className="flex-none text-gray-400">@</span>
              {side(event.home_team)}
            </span>
            <span className="hidden md:inline">{event.away_team} @ {event.home_team}</span>
          </>
        ) : (
          <>{event.away_team} @ {event.home_team}</>
        )}
      </h3>
      <p className="mt-1 text-xs md:text-sm text-gray-500">
        {date}
        <span className="mx-1.5 text-gray-300" aria-hidden="true">•</span>
        {time} {zoneAbbr}
      </p>
    </div>
  );
}

interface PropsTableProps {
  markets: ProcessedPropsMarket[];
  selectedBookmakers?: string[];
  playerFilter?: string;
  event: PropsEvent; // the game these props belong to
  league: string;
  onBack: () => void; // back to the game list
}

type Side = 'Over' | 'Under';

export default function PropsTable({ markets, selectedBookmakers, playerFilter = '', event, league, onBack }: PropsTableProps) {
  // Signed-in visitors get the bet ticket on tap; signed out, a tap goes to the book
  const { user } = useUser();
  const [ticket, setTicket] = useState<TicketPick | null>(null);
  const ticketSeq = useRef(0);
  const [marketKey, setMarketKey] = useState<string | null>(null);

  // Markets that still have a player after the search filter
  const term = playerFilter.toLowerCase().trim();
  const shownMarkets = markets
    .map((m) => ({ ...m, props: term ? m.props.filter((p) => p.playerName.toLowerCase().includes(term)) : m.props }))
    .filter((m) => m.props.length > 0);
  // The open market: the chosen chip, or the first while none is chosen (or
  // the chosen one has no matching player)
  const market = shownMarkets.find((m) => m.marketKey === marketKey) ?? shownMarkets[0];

  // Chosen books that price this market. Books with no prop prices (Novig /
  // ProphetX: the props feed is regions=us) would only add empty columns.
  const books = market
    ? (selectedBookmakers && selectedBookmakers.length > 0 ? BOOKMAKERS.filter((b) => selectedBookmakers.includes(b)) : BOOKMAKERS).filter(
        (book) => market.props.some((p) => p.odds[book] && (p.odds[book].over !== null || p.odds[book].under !== null))
      )
    : [];

  const lineOf = (prop: ProcessedProp, book: string) => prop.odds[book]?.line ?? prop.line;
  const priceOf = (prop: ProcessedProp, book: string, side: Side) =>
    (side === 'Over' ? prop.odds[book]?.over : prop.odds[book]?.under) ?? null;

  // Best book(s) for one side of a prop. Books post different lines for the
  // same prop, so the LINE wins first (lower is better for Over, higher for
  // Under — the rule the spreads table uses), and the price breaks ties.
  const bestBooks = (prop: ProcessedProp, side: Side): string[] => {
    let best: string[] = [];
    let bestLine = 0;
    let bestPrice = 0;
    for (const book of books) {
      const price = priceOf(prop, book, side);
      if (price === null) continue;
      const line = lineOf(prop, book);
      const lineBetter = side === 'Over' ? line < bestLine : line > bestLine;
      if (best.length === 0 || lineBetter || (line === bestLine && price > bestPrice)) {
        best = [book];
        bestLine = line;
        bestPrice = price;
      } else if (line === bestLine && price === bestPrice) {
        best.push(book);
      }
    }
    return best;
  };

  // Tap on a price
  const openPick = (prop: ProcessedProp, book: string, side: Side, line: number, price: number) => {
    markPriceTapped(); // retires the board's tap hint on this device
    const title = `${prop.playerName} ${side} ${line} ${prop.marketName}`; // "Jalen Hurts Over 189.5 Pass Yards"
    // The props feed carries no betslip links, so the book opens on its own page
    const buildGo = (to?: string) => goUrl({ book, sport: league, game: event.id, market: prop.marketKey, outcome: title, to });
    if (!user) {
      openBetLink(buildGo());
      return;
    }
    const matchup = `${event.away_team} @ ${event.home_team}`;
    // Event date in local time (toISOString would shift late games a day)
    const d = new Date(event.commence_time);
    const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const seq = ++ticketSeq.current;
    setTicket({
      title,
      subtitle: matchup,
      odds: price,
      book,
      bookLogo: BOOKMAKER_LOGOS[book],
      buildGo,
      commenceTime: event.commence_time,
      draft: {
        date: new Date().toISOString().split('T')[0],
        eventDate,
        sport: getSportFromLeague(league),
        league: getLeagueDisplayName(league),
        description: matchup,
        awayTeam: event.away_team,
        homeTeam: event.home_team,
        betType: 'prop',
        bet: title,
        odds: price,
        status: 'pending',
        book,
      },
    });
    // The player's team (badge accent on the game card, theme on the share
    // page): one roster lookup, best effort, added to the open ticket when it
    // comes back. A bet tracked before then still saves, without a side.
    fetch(
      `/api/player-team?league=${encodeURIComponent(league)}&player=${encodeURIComponent(prop.playerName)}&teams=${encodeURIComponent(`${event.away_team},${event.home_team}`)}`
    )
      .then((r) => r.json())
      .then((j) => {
        if (!j?.team || ticketSeq.current !== seq) return;
        setTicket((t) => (t ? { ...t, draft: { ...t.draft, team: j.team } } : t));
      })
      .catch(() => {
        /* unresolved — no side on the bet */
      });
  };

  const chip = (active: boolean) =>
    `flex-none whitespace-nowrap px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
      active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`;

  // One price cell, the same build as OddsTable's: "O 189.5 (-113)", green with
  // a Best tag when it is the best number for that side.
  const cell = (prop: ProcessedProp, book: string, side: Side, isBest: boolean, border: string) => {
    const price = priceOf(prop, book, side);
    const line = lineOf(prop, book);
    return (
      <td
        key={`${book}-${side}`}
        className={`relative px-2 md:px-4 pt-3 pb-4 whitespace-nowrap text-center select-none ${border} ${
          price !== null ? 'cursor-pointer hover:bg-blue-50' : ''
        }`}
        onClick={() => price !== null && openPick(prop, book, side, line, price)}
      >
        {price !== null ? (
          <div className={`text-xs md:text-sm tabular-nums ${isBest ? 'text-green-600 font-bold' : 'text-gray-900'}`}>
            {side === 'Over' ? 'O' : 'U'} {line} ({formatOdds(price)})
            {isBest && (
              // Sits in the cell's bottom padding (td is relative). These rows hold
              // text only, so the padding is a touch deeper than OddsTable's
              <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] leading-[11px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 pointer-events-none">
                Best
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs md:text-sm text-gray-500">-</span>
        )}
      </td>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {ticket && <BetTicket pick={ticket} onClose={() => setTicket(null)} />}

      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex items-start justify-between gap-2">
          <PropsEventHeader event={event} league={league} />
          <button
            type="button"
            onClick={onBack}
            className="flex-none inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs md:text-sm text-gray-700 hover:bg-gray-200"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            All games
          </button>
        </div>

        {/* Markets: one row that scrolls sideways on phones, wraps on wide screens */}
        {shownMarkets.length > 0 && (
          <div className="scrollbar-none -mx-3 mt-3 flex gap-1 overflow-x-auto px-3 md:mx-0 md:flex-wrap md:gap-2 md:overflow-visible md:px-0">
            {shownMarkets.map((m) => (
              <button key={m.marketKey} type="button" className={chip(m.marketKey === market?.marketKey)} onClick={() => setMarketKey(m.marketKey)}>
                {m.marketName}
              </button>
            ))}
          </div>
        )}
      </div>

      {!market ? (
        <div className="p-6 text-center text-sm text-gray-500">
          {term ? <>No players found matching &quot;{playerFilter}&quot;.</> : 'No player props available for this game yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          {/* border-separate: Safari drops sticky table cells under border-collapse.
              Keyed by market so switching chips remounts the table (see OddsTable). */}
          <table key={market.marketKey} className="min-w-full border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr>
                {/* Frozen while horizontally scrolling the book columns */}
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-20 bg-gray-50 border-r border-b border-gray-100">
                  Player
                </th>
                {books.map((book) => (
                  <th key={book} className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <img src={BOOKMAKER_LOGOS[book]} alt={book} className="h-6 mx-auto" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {market.props.map((prop, i) => {
                const bestOver = bestBooks(prop, 'Over');
                const bestUnder = bestBooks(prop, 'Under');
                // a full line under each player, none after the last
                const playerBorder = i < market.props.length - 1 ? 'border-b border-b-gray-200' : '';
                return (
                  <Fragment key={prop.playerName}>
                    <tr>
                      <td
                        rowSpan={2}
                        className={`px-2 md:px-4 py-2 text-xs md:text-sm font-medium leading-tight text-gray-900 sticky left-0 z-10 bg-white border-r border-gray-100 max-w-[104px] md:max-w-none ${playerBorder}`}
                      >
                        {prop.playerName}
                      </td>
                      {books.map((book) => cell(prop, book, 'Over', bestOver.includes(book), 'border-b border-b-gray-100'))}
                    </tr>
                    <tr>{books.map((book) => cell(prop, book, 'Under', bestUnder.includes(book), playerBorder))}</tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
