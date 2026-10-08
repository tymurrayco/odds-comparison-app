// src/components/OddsTable.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Game, BOOKMAKERS } from '@/lib/api';
import { formatOdds } from '@/lib/utils';
import BetTicket, { type TicketPick } from '@/components/BetTicket';
import { useUser } from '@/lib/userAuth';
import { GameRestData, TeamRestInfo } from '@/lib/nhlRest';
import { resolveDeepLink, fillLinkTemplate, promptForState, openBetLink, appLinkHref, logClickBeacon } from '@/lib/betLinks';
import { goUrl } from '@/lib/books';
import { useTeamColorMap, teamInfoFromMap } from '@/lib/myGameBets';

// Sport keys whose team cells link to /team/[league]/[name] pages
const TEAM_PAGE_LEAGUES: Record<string, string> = {
  americanfootball_ncaaf: 'ncaaf',
  americanfootball_nfl: 'nfl',
  americanfootball_nfl_preseason: 'nfl',
};

interface OddsTableProps {
  games: Game[];
  view?: 'moneyline' | 'spread' | 'totals' | 'spreads_h1';
  league?: string;
  selectedBookmakers?: string[];
  awayLogo?: string;
  homeLogo?: string;
  restData?: GameRestData | null;
  isLive?: boolean; // in-progress: drop books whose line has gone stale
  // Open (pre-game) or Close (started) line: spread (home perspective) in the
  // spread view, total in the O/U view
  openLine?: { kind: 'open' | 'close'; homeSpread: number | null; total: number | null; openedOn: string } | null;
}

interface OddsItem {
  bookmaker: string;
  price: number;
}

// Helper function to map league ID to sport name
function getSportFromLeague(league: string): string {
  if (league.includes('nba') || league.includes('basketball')) return 'Basketball';
  if (league.includes('nfl') || league.includes('americanfootball_nfl')) return 'Football';
  if (league.includes('ncaaf') || league.includes('americanfootball_ncaaf')) return 'Football';
  if (league.includes('cfl')) return 'Football';
  if (league.includes('nhl') || league.includes('icehockey')) return 'Hockey';
  if (league.includes('mlb') || league.includes('baseball')) return 'Baseball';
  if (league.includes('mls') || league.includes('soccer')) return 'Soccer';
  if (league.includes('epl') || league.includes('soccer')) return 'Soccer';
  if (league.includes('wnba')) return 'Basketball';
  return 'Other';
}

// Helper function to get league display name
function getLeagueDisplayName(league: string): string {
  const leagueMap: { [key: string]: string } = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'baseball_mlb': 'MLB',
    'soccer_usa_mls': 'MLS',
    'soccer_epl': 'EPL',
    'basketball_ncaab': 'NCAAB',
    'basketball_wnba': 'WNBA',
    'americanfootball_cfl': 'CFL'
  };
  return leagueMap[league] || league.toUpperCase();
}

// Team cell: logo with graceful fallback — when the logo is missing/broken
// (e.g. CFL has no ESPN logos), show the team name on mobile too instead of
// leaving the cell blank.
function TeamLogoOrName({ srcs, name, restBadge }: { srcs: (string | undefined)[]; name: string; restBadge?: React.ReactNode }) {
  const list = Array.from(new Set(srcs.filter((s): s is string => !!s)));
  const key = list.join('|');
  const [idx, setIdx] = useState(0);
  // The URL that actually rendered (not a boolean): when the candidate list
  // changes — the live-score logo arriving, a market switch — an already
  // shown logo that is still a candidate is kept. Restarting the chain used to
  // set the same URL again, the browser fires no load event for an unchanged
  // src, and the name stayed visible on mobile.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    const keep = loadedSrc ? list.indexOf(loadedSrc) : -1;
    setIdx(keep >= 0 ? keep : 0);
  }
  const src = list[idx];
  const loaded = !!src && loadedSrc === src;
  return (
    // Mobile shows the logo alone — center it in the frozen column; on sm+ the
    // name sits beside it, so the group goes back to left-aligned.
    <div className={`flex items-center ${src && loaded ? 'justify-center sm:justify-start' : ''}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-7 w-7 sm:h-6 sm:w-6 sm:mr-1.5 flex-shrink-0 object-contain"
          onLoad={() => setLoadedSrc(src)}
          onError={() => setIdx(i => i + 1)}
        />
      )}
      {/* Name hides on mobile only once a logo has actually rendered — a broken
          image must never leave the cell empty */}
      <span className={src && loaded ? 'hidden sm:inline truncate' : 'inline truncate'}>{name}</span>
      {restBadge}
    </div>
  );
}

// Rest badge component for NHL
function RestBadge({ label, type }: { label: string; type: 'fatigue' | 'advantage' | 'warning' }) {
  const colorClasses = {
    fatigue: 'bg-orange-100 text-orange-700',
    advantage: 'bg-emerald-100 text-emerald-700',
    warning: 'bg-amber-100 text-amber-700'
  };
  
  return (
    <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${colorClasses[type]}`}>
      {label}
    </span>
  );
}

// Get badges for a team based on rest data
function getTeamRestBadges(teamRest: TeamRestInfo, hasAdvantage: boolean, advantageDays: number): React.ReactNode {
  // Priority 1: B2B (most critical)
  if (teamRest.isB2B) {
    return <RestBadge label="B2B" type="fatigue" />;
  }
  // Priority 2: 3-in-4
  if (teamRest.is3in4) {
    return <RestBadge label="3in4" type="fatigue" />;
  }
  // Priority 3: 4-in-6
  if (teamRest.is4in6) {
    return <RestBadge label="4in6" type="warning" />;
  }
  // Priority 4: Rest advantage (only if 2+ days and this team has the advantage)
  if (hasAdvantage && advantageDays >= 2) {
    return <RestBadge label={`${advantageDays}RA`} type="advantage" />;
  }
  
  return null;
}

export default function OddsTable({ games, view = 'moneyline', league = 'basketball_nba', selectedBookmakers, awayLogo, homeLogo, restData, isLive = false, openLine = null }: OddsTableProps) {
  // Signed-in visitors get a bet ticket on tap (open the book and/or track
  // the bet); signed out, a tap goes straight to the book.
  const { user } = useUser();
  const [ticket, setTicket] = useState<TicketPick | null>(null);
  const [showOpenedOn, setShowOpenedOn] = useState(false);
  // ESPN logos for every team in the league — local /team-logos files use
  // abbreviated names ("northdakotastbison") that the odds-API names never
  // match, and FCS teams have no file at all.
  const teamMap = useTeamColorMap(league);

  // Use selected bookmakers or default to all
  const displayBookmakers = selectedBookmakers && selectedBookmakers.length > 0 
    ? BOOKMAKERS.filter(b => selectedBookmakers.includes(b))
    : BOOKMAKERS;

  if (!games || games.length === 0) {
    return <div className="p-4">No games available</div>;
  }

  // What a click on a book cell is about — carried on the /go URL for logging.
  type ClickContext = { game: Game; market: string; outcome: string };
  // The priced selection in the cell, for the bet ticket.
  type CellPick = {
    team: string;
    odds: number;
    betType: 'spread' | 'total' | 'moneyline';
    point?: number;
    totalType?: 'Over' | 'Under';
  };
  const goParams = (book: string, ctx: ClickContext) => ({
    book,
    sport: ctx.game.sport_key,
    game: ctx.game.id,
    market: ctx.market,
    outcome: ctx.outcome,
  });

  // The ticket for a cell: display lines + the bet row it would save.
  const buildTicket = (book: string, link: string | undefined, ctx: ClickContext, pick: CellPick): TicketPick => {
    const { game } = ctx;
    const title =
      pick.betType === 'spread'
        ? `${pick.team} ${pick.point! > 0 ? '+' : ''}${pick.point}`
        : pick.betType === 'total'
          ? `${pick.totalType} ${pick.point}`
          : `${pick.team} ML`;
    const matchup = `${game.away_team} @ ${game.home_team}`;
    // Event date in local time (toISOString would shift late games a day)
    const d = new Date(game.commence_time);
    const eventDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      title,
      subtitle: matchup,
      odds: pick.odds,
      book,
      bookLogo: bookmakerLogos[book],
      link,
      buildGo: (to) => goUrl({ ...goParams(book, ctx), to }),
      draft: {
        date: new Date().toISOString().split('T')[0],
        eventDate,
        sport: getSportFromLeague(league),
        league: getLeagueDisplayName(league),
        description: matchup,
        awayTeam: game.away_team,
        homeTeam: game.home_team,
        team: pick.betType === 'total' ? undefined : pick.team,
        betType: pick.betType,
        bet: title,
        odds: pick.odds,
        status: 'pending',
        book,
      },
    };
  };

  // Click on any priced book cell. Signed in → the bet ticket. Signed out →
  // /go/[book] click-out (logged, 302): with a deep link it lands on the
  // betslip; without one (BetOnline, or a book that sent no link) on the
  // book's home/affiliate page. BetMGM/BetRivers links are templates needing
  // the user's state — resolved from localStorage, prompted once on first
  // use; cancelling the prompt does nothing.
  const handleBookClick = (book: string, link: string | undefined, e: React.MouseEvent, ctx: ClickContext, pick: CellPick) => {
    // Tap landed on the app-link overlay: let the native anchor navigate
    if ((e.target as HTMLElement).closest?.('a[data-app-link]')) return;
    e.preventDefault();
    e.stopPropagation();
    if (user) {
      setTicket(buildTicket(book, link, ctx, pick));
      return;
    }
    let resolved: string | undefined;
    if (link) {
      const r = resolveDeepLink(link);
      if (r) {
        resolved = r;
      } else {
        const state = promptForState();
        if (!state) return;
        resolved = fillLinkTemplate(link, state);
      }
    }
    openBetLink(goUrl({ ...goParams(book, ctx), to: resolved }), resolved);
  };

  // App-link books (ProphetX) on phones: an invisible real <a> over the cell,
  // since iOS only opens the app from a genuine link tap.
  // The anchor points STRAIGHT at the app link (iOS won't open the app from a
  // 302 landing on a universal link), so the click is logged with a beacon
  // POST to /go instead of going through the redirect.
  // Signed in there is no overlay: the tap opens the ticket, whose own
  // "Open in" button is the real anchor.
  const renderAppLink = (book: string, link: string | undefined, ctx: ClickContext) => {
    if (user) return null;
    const href = appLinkHref(link);
    return href ? (
      <a
        href={href}
        onClick={() => logClickBeacon(goUrl({ ...goParams(book, ctx), to: href }))}
        data-app-link
        aria-label="Open in app"
        className="absolute inset-0"
        style={{ WebkitTouchCallout: 'none' }}
      />
    ) : null;
  };

  // Bookmaker logos mapping with type annotation
  const bookmakerLogos: { [key: string]: string } = {
  'DraftKings': '/bookmaker-logos/draftkings.png',
  'FanDuel': '/bookmaker-logos/fd.png',
  'BetMGM': '/bookmaker-logos/betmgm.png',
  'BetRivers': '/bookmaker-logos/betrivers.png',
  'Caesars': '/bookmaker-logos/caesars.png',
  'BetOnline.ag': '/bookmaker-logos/betonline.png',
  'Kalshi': '/bookmaker-logos/kalshi.png',
  'Novig': '/bookmaker-logos/novig.png',
  'ProphetX': '/bookmaker-logos/prophetx.png'
  };
  
  // Map market keys
  const marketKey = view === 'moneyline' ? 'h2h' : 
                   view === 'spread' ? 'spreads' : 
                   view === 'spreads_h1' ? 'spreads_h1' : 'totals';
  // Open/Close column: spread view needs a spread line, O/U view a total
  const openLineShown =
    !!openLine &&
    ((marketKey === 'spreads' && openLine.homeSpread !== null) ||
      (marketKey === 'totals' && openLine.total !== null));

  return (
    <div className="overflow-x-auto">
      {ticket && <BetTicket pick={ticket} onClose={() => setTicket(null)} />}

      {games.map(game => {
        // Only show bookmakers that actually price this game's current market —
        // empty columns (squished logo + "-") add no value.
        // In-play, books re-price at different speeds and some park at the
        // closing number for minutes at a time — the mix looked like nonsense
        // (-4.5 next to -7.5) and the "best line" was just the slowest book.
        // Keep only lines refreshed within 2 minutes of the freshest one.
        const LIVE_STALE_MS = 2 * 60 * 1000;
        const newestUpdate = isLive
          ? Math.max(0, ...game.bookmakers.map(b => new Date(b.last_update).getTime() || 0))
          : 0;
        const activeBookmakers = displayBookmakers.filter(book => {
          const bookieData = game.bookmakers.find(b => b.title === book);
          const market = bookieData?.markets.find(m => m.key === marketKey);
          if (!market || market.outcomes.length === 0) return false;
          if (isLive && newestUpdate > 0) {
            const at = new Date(bookieData!.last_update).getTime() || 0;
            if (newestUpdate - at > LIVE_STALE_MS) return false;
          }
          return true;
        });

        // For each team, calculate which bookmakers offer the best odds (only among displayed bookmakers)
        const bestBookmakersByTeam: { [key: string]: string[] } = {};
        
        // Calculate best bookmakers for moneyline
        if (marketKey === 'h2h') {
          // For each team, find all available odds
          [game.away_team, game.home_team].forEach(team => {
            const allOdds: OddsItem[] = [];
            
            // Collect all odds for this team (only from displayed bookmakers)
            activeBookmakers.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === 'h2h');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === team);
              if (!outcome) return;
              
              allOdds.push({
                bookmaker: book,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[team] = [];
              return;
            }
            
            // Find the best odds value
            let bestPrice = allOdds[0].price;
            allOdds.forEach(odds => {
              // Compare based on favoritism
              if (bestPrice < 0 && odds.price < 0) {
                // Both negative (favorites) - less negative is better
                if (odds.price > bestPrice) {
                  bestPrice = odds.price;
                }
              } else if (bestPrice > 0 && odds.price > 0) {
                // Both positive (underdogs) - more positive is better
                if (odds.price > bestPrice) {
                  bestPrice = odds.price;
                }
              } else {
                // Mixed case - positive always beats negative
                if (odds.price > 0 && bestPrice < 0) {
                  bestPrice = odds.price;
                }
              }
            });
            
            // Find all bookmakers with the best price
            const bestBookmakers = allOdds
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
            
            bestBookmakersByTeam[team] = bestBookmakers;
          });
        }
        
        // Pre-calculate best bookmakers for spreads and 1H spreads
        if (marketKey === 'spreads' || marketKey === 'spreads_h1') {
          [game.away_team, game.home_team].forEach(teamName => {
            const allOdds: { bookmaker: string, point: number, price: number }[] = [];
            
            // Collect all odds for this team (only from displayed bookmakers)
            activeBookmakers.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === marketKey);
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === teamName);
              if (!outcome || typeof outcome.point === 'undefined') return;
              
              allOdds.push({
                bookmaker: book,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[teamName] = [];
              return;
            }
            
            // Find the best spread value
            const bestPoint = Math.max(...allOdds.map(odds => odds.point));
            
            // Get all bookmakers with the best point
            const bookiesWithBestPoint = allOdds.filter(odds => odds.point === bestPoint);
            
            // If only one bookmaker has the best point, it's the best
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[teamName] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Find the best price among bookmakers with the best point
            const bestPrice = Math.max(...bookiesWithBestPoint.map(odds => odds.price));
            
            // All bookmakers with both the best point and the best price are "best"
            bestBookmakersByTeam[teamName] = bookiesWithBestPoint
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
          });
        }
        
        // Pre-calculate best bookmakers for totals
        if (marketKey === 'totals') {
          // For totals we associate Over with away team and Under with home team
          const totalTypes = ['Over', 'Under'];
          const teams = [game.away_team, game.home_team];
          
          teams.forEach((teamName, index) => {
            const totalType = totalTypes[index];
            const allOdds: { bookmaker: string, point: number, price: number }[] = [];
            
            // Collect all odds for this total type (only from displayed bookmakers)
            activeBookmakers.forEach(book => {
              const bookieData = game.bookmakers.find(b => b.title === book);
              if (!bookieData) return;
              
              const market = bookieData.markets.find(m => m.key === 'totals');
              if (!market) return;
              
              const outcome = market.outcomes.find(o => o.name === totalType);
              if (!outcome || typeof outcome.point === 'undefined') return;
              
              allOdds.push({
                bookmaker: book,
                point: outcome.point,
                price: outcome.price
              });
            });
            
            if (allOdds.length === 0) {
              bestBookmakersByTeam[teamName] = [];
              return;
            }
            
            // Find the best point value (lowest for Over, highest for Under)
            const bestPoint = totalType === 'Over' ?
              Math.min(...allOdds.map(odds => odds.point)) :
              Math.max(...allOdds.map(odds => odds.point));
            
            // Get all bookmakers with the best point
            const bookiesWithBestPoint = allOdds.filter(odds => odds.point === bestPoint);
            
            // If only one bookmaker has the best point, it's the best
            if (bookiesWithBestPoint.length === 1) {
              bestBookmakersByTeam[teamName] = [bookiesWithBestPoint[0].bookmaker];
              return;
            }
            
            // Find the best price among bookmakers with the best point
            const bestPrice = Math.max(...bookiesWithBestPoint.map(odds => odds.price));
            
            // All bookmakers with both the best point and the best price are "best"
            bestBookmakersByTeam[teamName] = bookiesWithBestPoint
              .filter(odds => odds.price === bestPrice)
              .map(odds => odds.bookmaker);
          });
        }
        
        return (
          // border-separate: Safari drops sticky table cells under border-collapse.
          // Key includes the market so switching tabs remounts the table —
          // without it, sticky cells stayed unpainted until a scroll forced a repaint.
          <table key={`${game.id}-${marketKey}`} className="min-w-full border-separate border-spacing-0">
            <thead className="bg-gray-50">
              <tr>
                {/* Frozen while horizontally scrolling the book columns */}
                <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-20 bg-gray-50 border-r border-b border-gray-100">
                  Team
                </th>
                {openLineShown && openLine && (
                  <th
                    className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-r border-gray-100"
                    title={openLine.kind === 'close'
                      ? `Last consensus ${marketKey === 'totals' ? 'total' : 'spread'} seen before kickoff`
                      : `First consensus ${marketKey === 'totals' ? 'total' : 'spread'} seen, ${openLine.openedOn}`}
                  >
                    {openLine.kind === 'close' ? 'Close' : 'Open'}
                  </th>
                )}
                {activeBookmakers.map(book => (
                  <th key={book} className="px-2 md:px-4 py-2 md:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-100">
                    <img src={bookmakerLogos[book]} alt={book} className="h-6 mx-auto" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[game.away_team, game.home_team].map((team, index) => {
                // Logo chain: live-score logo → ESPN league map → local file → name
                const scoreLogo = index === 0 ? awayLogo : homeLogo;
                const espnLogo = teamInfoFromMap(teamMap, team)?.logo;
                const localLogo = `/team-logos/${team.toLowerCase().replace(/\s+/g, '')}.png`;
                const logoSrcs = [scoreLogo, espnLogo, localLogo];
                
                // Get rest badge for this team (NHL only)
                const teamRestInfo = restData 
                  ? (index === 0 ? restData.awayRest : restData.homeRest)
                  : null;
                const hasRestAdvantage = restData 
                  ? (index === 0 ? restData.restAdvantage === 'away' : restData.restAdvantage === 'home')
                  : false;
                const restBadge = teamRestInfo 
                  ? getTeamRestBadges(teamRestInfo, hasRestAdvantage, restData?.restAdvantageDays || 0)
                  : null;
                
                return (
                  <tr key={team}>
                    <td className={`px-2 md:px-4 py-3 text-xs md:text-sm font-medium text-gray-900 sticky left-0 z-10 bg-white border-r border-gray-100 ${index === 0 ? 'border-b border-b-gray-200' : ''} ${restData ? 'min-w-[70px]' : 'max-w-[120px] whitespace-nowrap'}`}>
                      {/* Logo only on mobile / name on desktop — name shows on mobile too when the logo is missing */}
                      {TEAM_PAGE_LEAGUES[game.sport_key] ? (
                        // Football team cells link to the team page (logo is the tap target on mobile)
                        <Link
                          href={`/team/${TEAM_PAGE_LEAGUES[game.sport_key]}/${encodeURIComponent(team)}`}
                          className="block hover:text-blue-700"
                          onClick={() => {
                            // Remember where we left the board: the browser's own
                            // scroll restore fires before the games have loaded,
                            // so the home page re-scrolls to this card itself.
                            try {
                              sessionStorage.setItem(
                                'oddsday:return',
                                JSON.stringify({ league: game.sport_key, gameId: game.id, y: window.scrollY, at: Date.now() })
                              );
                            } catch {
                              /* storage unavailable — back just lands at the top */
                            }
                          }}
                        >
                          <TeamLogoOrName srcs={logoSrcs} name={team} restBadge={restBadge} />
                        </Link>
                      ) : (
                        <TeamLogoOrName srcs={logoSrcs} name={team} restBadge={restBadge} />
                      )}
                    </td>

                    {openLineShown && openLine && (() => {
                      // Spread from this row's team side; total as O/U by row
                      const fmtSpread = (v: number) => (v === 0 ? 'PK' : `${v > 0 ? '+' : ''}${v}`);
                      const text = marketKey === 'totals'
                        ? `${index === 0 ? 'O' : 'U'} ${openLine.total}`
                        : fmtSpread(index === 0 ? -openLine.homeSpread! : openLine.homeSpread!);
                      return (
                        <td
                          className={`px-2 md:px-4 py-3 whitespace-nowrap text-center text-xs md:text-sm tabular-nums bg-gray-50/60 border-r border-gray-100 cursor-pointer select-none ${index === 0 ? 'border-b border-b-gray-200' : ''} text-gray-500`}
                          title={openLine.kind === 'close' ? `Closed ${text}` : `Opened ${text} (${openLine.openedOn})`}
                          onClick={() => openLine.kind === 'open' && setShowOpenedOn((x) => !x)}
                        >
                          {text}
                          {showOpenedOn && index === 1 && (
                            <div className="text-[10px] font-normal text-gray-400">{openLine.openedOn}</div>
                          )}
                        </td>
                      );
                    })()}

                    {activeBookmakers.map(book => {
                      const bookieData = game.bookmakers.find(b => b.title === book);
                      
                      // Check if this is one of the best bookmakers for this team
                      const isBest = bestBookmakersByTeam[team]?.includes(book) || false;

                      if (marketKey === 'h2h') {
                        const marketData = bookieData?.markets.find(m => m.key === 'h2h');
                        const outcomeData = marketData?.outcomes.find(o => o.name === team);
                        const deepLink = outcomeData?.link;
                        const ctx: ClickContext = { game, market: marketKey, outcome: team };

                        return (
                          <td
                            key={book}
                            className={`relative px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none ${index === 0 ? 'border-b border-gray-200' : ''} ${outcomeData ? 'hover:bg-blue-50' : ''}`}
                            onClick={(e) => outcomeData && handleBookClick(book, deepLink, e, ctx, { team, odds: outcomeData.price, betType: 'moneyline' })}
                          >
                            {outcomeData && renderAppLink(book, deepLink, ctx)}
                            {outcomeData ? (
                              <div className={`text-xs md:text-sm font-medium ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
                                {formatOdds(outcomeData.price)}
                                {isBest && (
                                  // Tucked into the cell's bottom padding (td is relative) — no extra row height
                                  <span className="absolute bottom-[6px] left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] leading-[11px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 pointer-events-none">
                                    Best
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs md:text-sm text-gray-500">-</span>
                            )}
                          </td>
                        );
                      }
                      
                      if (marketKey === 'spreads' || marketKey === 'spreads_h1') {
                        const marketData = bookieData?.markets.find(m => m.key === marketKey);
                        const outcomeData = marketData?.outcomes.find(o => o.name === team);
                        const deepLink = outcomeData?.link;
                        const priced = !!outcomeData && typeof outcomeData.point !== 'undefined';
                        const ctx: ClickContext = {
                          game,
                          market: marketKey,
                          outcome: priced ? `${team} ${(outcomeData?.point ?? 0) > 0 ? '+' : ''}${outcomeData?.point}` : team,
                        };

                        return (
                          <td
                            key={book}
                            className={`relative px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none ${index === 0 ? 'border-b border-gray-200' : ''} ${priced ? 'hover:bg-blue-50' : ''}`}
                            onClick={(e) => priced && handleBookClick(book, deepLink, e, ctx, { team, odds: outcomeData!.price, betType: 'spread', point: outcomeData!.point })}
                          >
                            {priced && renderAppLink(book, deepLink, ctx)}
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
                                {outcomeData.point > 0 ? '+' : ''}{outcomeData.point} ({formatOdds(outcomeData.price)})
                                {isBest && (
                                  // Tucked into the cell's bottom padding (td is relative) — no extra row height
                                  <span className="absolute bottom-[6px] left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] leading-[11px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 pointer-events-none">
                                    Best
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs md:text-sm text-gray-500">-</span>
                            )}
                          </td>
                        );
                      }
                      
                      if (marketKey === 'totals') {
                        const marketData = bookieData?.markets.find(m => m.key === 'totals');
                        const totalType = index === 0 ? 'Over' : 'Under';
                        const outcomeData = marketData?.outcomes.find(o => 
                          (index === 0 && o.name === 'Over') || (index === 1 && o.name === 'Under')
                        );
                        const deepLink = outcomeData?.link;
                        const priced = !!outcomeData && typeof outcomeData.point !== 'undefined';
                        const ctx: ClickContext = {
                          game,
                          market: marketKey,
                          outcome: priced ? `${totalType} ${outcomeData?.point}` : totalType,
                        };

                        return (
                          <td
                            key={book}
                            className={`relative px-2 md:px-4 py-3 whitespace-nowrap text-center cursor-pointer select-none ${index === 0 ? 'border-b border-gray-200' : ''} ${priced ? 'hover:bg-blue-50' : ''}`}
                            onClick={(e) => priced && handleBookClick(book, deepLink, e, ctx, { team, odds: outcomeData!.price, betType: 'total', point: outcomeData!.point, totalType })}
                          >
                            {priced && renderAppLink(book, deepLink, ctx)}
                            {outcomeData && typeof outcomeData.point !== 'undefined' ? (
                              <div className={`text-xs md:text-sm ${
                                isBest ? 'text-green-600 font-bold' : 'text-gray-900'
                              }`}>
                                {index === 0 ? 'O' : 'U'} {outcomeData.point} ({formatOdds(outcomeData.price)})
                                {isBest && (
                                  // Tucked into the cell's bottom padding (td is relative) — no extra row height
                                  <span className="absolute bottom-[6px] left-1/2 -translate-x-1/2 px-1 rounded-full text-[8px] leading-[11px] font-semibold uppercase tracking-wide bg-green-100 text-green-800 pointer-events-none">
                                    Best
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs md:text-sm text-gray-500">-</span>
                            )}
                          </td>
                        );
                      }
                      
                      return <td key={book} className={`px-2 md:px-4 py-3 text-center ${index === 0 ? 'border-b border-gray-200' : ''}`}>-</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}