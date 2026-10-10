// src/components/GameCard.tsx
import { useEffect, useState } from 'react';
import OddsTable from './OddsTable';
import AnalysisTabs, { AnalysisTabRequest } from './AnalysisTabs';
import LedgerMatchup, { ledgerMatchupUrl } from './LedgerMatchup';
import { cachedJson } from '@/lib/matchupCache';
import InjuryReport, { loadInjuries, startingQbOut, injuryStatusLabel, type InjuryEntry } from './InjuryReport';
import { Game, ESPNGameScore } from '@/lib/api';
import { GameRestData } from '@/lib/nhlRest';
import { Bet } from '@/lib/betService';
import { usePendingBetsForGame, useTeamColorMap, teamInfoFromMap, wageredTeamColor, MyBetBadge, TeamLogoImg } from '@/lib/myGameBets';
import { NeutralGame, fetchNeutralGames, findNeutralGame, venueLocation } from '@/lib/neutralSites';
import { usePrefs, zoneOption } from '@/lib/prefs';
import { useGameNote } from '@/lib/gameNotes';
import { matchGameByTeams } from '@/lib/api';
import type { GameWeather } from '@/lib/weather';
import { shortSchool } from '@/lib/teamNames';
import { WeatherIcons, weatherFacts, weatherHeadline } from './WeatherIcons';
import GameNoteSheet from './GameNoteSheet';
import { useFriendBetsForGame, betGroupKey, type FriendBet } from '@/lib/friendBets';
import { FriendAvatar, FriendBetsPanel } from './FriendBets';
import BetTicket, { type TicketPick } from './BetTicket';

// First word of the two-word college mascots (Yellow Jackets, Sun Devils, Red
// Raiders, Fighting Irish, …) — only used when ESPN's team list has no match.
const TWO_WORD_MASCOT_STARTS = new Set([
  'yellow', 'green', 'thundering', 'sun', 'wolf', 'red', 'scarlet', 'fighting', "fightin'", 'blue', 'golden',
  "ragin'", 'mean', 'rainbow', 'crimson', 'big', 'nittany', 'demon', 'horned', 'mountain', 'black', 'great',
  'purple', 'tar', 'river', 'screaming', 'delta', "runnin'", 'white', 'maple', 'trail',
]);

interface GameCardProps {
  game: Game;
  selectedBookmakers?: string[];
  isFavorite?: boolean;
  onToggleFavorite?: (gameId: string) => void;
  liveScore?: ESPNGameScore | null;
  highlightedGameId?: string | null;
  restData?: GameRestData | null;
}

export default function GameCard({ game, selectedBookmakers, isFavorite = false, onToggleFavorite, liveScore, highlightedGameId, restData }: GameCardProps) {
  // Check if this is a soccer sport
  const isSoccer = game.sport_key === 'soccer_epl' || game.sport_key === 'soccer_usa_mls';
  
  // Check if this is NCAAF
  const isNCAAF = game.sport_key === 'americanfootball_ncaaf';

  // NFL (incl. preseason) gets the injury-report toggle
  const isNFL = game.sport_key === 'americanfootball_nfl'
    || game.sport_key === 'americanfootball_nfl_preseason';
  // Pro leagues whose phone card title is logo + mascot
  const isMascotTitle = isNFL || ['baseball_mlb', 'baseball_mlb_preseason', 'americanfootball_cfl', 'basketball_wnba', 'icehockey_nhl', 'basketball_nba'].includes(game.sport_key);
  
  // Default to moneyline for soccer, spread for everything else
  // NFL analysis panel: injury report or the Ledger projection
  const [nflPanel, setNflPanel] = useState<'injuries' | 'ledger'>('injuries');
  const [expandedMarket, setExpandedMarket] = useState<'moneyline' | 'spread' | 'totals' | 'analysis'>(
    isSoccer ? 'moneyline' : 'spread'
  );
  
  // Toast for link copied
  const [showLinkCopied, setShowLinkCopied] = useState(false);
  
  // Check if this game is highlighted from URL
  const isHighlighted = highlightedGameId === game.id;
  
  // Copy game link to clipboard
  // Includes league (saves API calls) and the sharer's timezone so the share
  // card shows game time in the sharer's local zone.
  const copyGameLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const url = `${window.location.origin}/game/${game.id}?league=${game.sport_key}&tz=${encodeURIComponent(tz)}`;
    // Pre-warm the share page (metadata + upstream caches) so the first social
    // crawler hits warm caches — cold renders made X's image fetch time out.
    fetch(url).catch(() => {});
    navigator.clipboard.writeText(url).then(() => {
      setShowLinkCopied(true);
      setTimeout(() => setShowLinkCopied(false), 2000);
    });
  };
  
  // Date/time text is in the VIEWER's zone, which the server can't know, so
  // it's rendered only after mount — the sport pages server-render the cards
  // and a UTC time in the HTML would mismatch the browser's on hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const prefs = usePrefs();
  // Private note on this game (signed-in accounts): a third icon beside the
  // star and share, and — only when a note exists — one quiet line under the
  // date line.
  const { note, canNote } = useGameNote(game.id);
  const [noteOpen, setNoteOpen] = useState(false);
  // Game-time weather (outdoor NFL / college football / MLB / CFL, upcoming games).
  // Only games with a flag — rain, snow, storms, real wind — show anything.
  const [weather, setWeather] = useState<GameWeather | null>(null);
  const [showWeather, setShowWeather] = useState(false);
  useEffect(() => {
    if (!['americanfootball_nfl', 'americanfootball_ncaaf', 'americanfootball_cfl', 'baseball_mlb'].includes(game.sport_key)) return;
    let alive = true;
    cachedJson<{ games?: GameWeather[] }>(`/api/weather?league=${game.sport_key}`)
      .then((d) => {
        if (alive) setWeather(matchGameByTeams(game, d.games ?? []));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [game.sport_key, game.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const badWeather = weather && weather.flags.length > 0 ? weather : null;
  // "odds.day projections" off: the NCAAF analysis panel (Summary / FEI /
  // Ledger) and the NFL Ledger panel are projections, so close them and hide
  // their buttons. The NFL injury report stays.
  useEffect(() => {
    if (prefs.showProjections) return;
    if (game.sport_key === 'americanfootball_ncaaf') setExpandedMarket((m) => (m === 'analysis' ? 'spread' : m));
    setNflPanel('injuries');
  }, [prefs.showProjections, game.sport_key]);

  // Format the date and time
  const gameDate = new Date(game.commence_time);
  // Device zone unless the account menu pins one (src/lib/prefs.ts)
  const zone = zoneOption(prefs.timeZone);
  // Games from today through six days out read as the weekday ("Sat"); a week
  // or more away (where the weekday alone is ambiguous) keeps "Oct 17".
  // Calendar days are counted in the display zone.
  const calendarDay = (d: Date) => {
    const [y, m, day] = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...zone })
      .format(d)
      .split('-')
      .map(Number);
    return Date.UTC(y, m - 1, day) / 86_400_000;
  };
  const daysOut = calendarDay(gameDate) - calendarDay(new Date());
  const formattedDate = gameDate.toLocaleDateString(
    undefined,
    daysOut >= 0 && daysOut <= 6 ? { weekday: 'short', ...zone } : { month: 'short', day: 'numeric', ...zone }
  );

  // Get the user's timezone abbreviation
  const timeZoneAbbr = new Intl.DateTimeFormat('en', { timeZoneName: 'short', ...zone })
    .formatToParts(gameDate)
    .find(part => part.type === 'timeZoneName')?.value || '';

  // 'numeric' hour so it reads 9:00 AM, not 09:00 AM
  const formattedTime = gameDate.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', ...zone});
  
  // Check if game is live (started but not completed)
  const now = new Date();
  const isLive = now > gameDate && liveScore?.state === 'in';
  const isCompleted = liveScore?.state === 'post';
  
  // Helper function to get first word of team name
  const getFirstWord = (teamName: string): string => {
    return teamName.split(' ')[0];
  };
  
  // Helper function to get team logo path
  const getTeamLogo = (teamName: string): string => {
    const cleanName = teamName.toLowerCase().replace(/\s+/g, '');
    return `/team-logos/${cleanName}.png`;
  };

  // Pending wagers on this game → header badge
  const myPendingBets = usePendingBetsForGame(game.away_team, game.home_team, game.commence_time);
  // Pending bets of people I follow → their photos on my badge when it is the
  // same bet, else a white badge of their own. A badge with photos opens the
  // who-bet-what list (friendPanel = that badge's group, or 'all' for "+N").
  // Off with the account menu's "Friends' bets on cards" switch.
  const followedBets = useFriendBetsForGame(game.away_team, game.home_team, game.commence_time);
  const friendBets = prefs.showFriendBets ? followedBets : [];
  const [friendPanel, setFriendPanel] = useState<string | null>(null);
  const [tailTicket, setTailTicket] = useState<TicketPick | null>(null);
  const teamColorMap = useTeamColorMap(game.sport_key);

  // Neutral-site lookup (NCAAF only). The fetch is memoized module-side, so
  // every card shares one request.
  const [neutralGame, setNeutralGame] = useState<NeutralGame | null>(null);
  const [showVenue, setShowVenue] = useState(false);
  useEffect(() => {
    if (!isNCAAF) return;
    let alive = true;
    fetchNeutralGames().then((games) => {
      if (alive) {
        setNeutralGame(findNeutralGame(games, game.away_team, game.home_team, game.commence_time));
      }
    });
    return () => { alive = false; };
  }, [isNCAAF, game.away_team, game.home_team, game.commence_time]);

  // Which analysis tab to open (the Ledger chip jumps straight to Ledger).
  const [analysisTabRequest, setAnalysisTabRequest] = useState<AnalysisTabRequest>({ tab: 'Summary', seq: 0 });
  const openAnalysis = (tab: AnalysisTabRequest['tab']) => {
    setAnalysisTabRequest((prev) => ({ tab, seq: prev.seq + 1 }));
    setExpandedMarket('analysis');
  };

  // Ledger projection for the header chip (NCAAF + NFL). Fetched WITHOUT the
  // neutral flag so the response (which carries both homeSpread and
  // neutralSpread) is requested once, before the neutral-site lookup resolves;
  // the chip then picks whichever spread fits the venue.
  interface LedgerChipData {
    away?: { matched: boolean; espnId: string | null; logo?: string | null } | null;
    home?: { matched: boolean; espnId: string | null; logo?: string | null } | null;
    isNeutralSite?: boolean;
    homeSpread?: number | null;
    neutralSpread?: number | null;
  }
  const [ledger, setLedger] = useState<LedgerChipData | null>(null);
  useEffect(() => {
    if (!isNCAAF && !isNFL) return;
    let alive = true;
    const url = ledgerMatchupUrl(game.away_team, game.home_team, false, isNFL ? 'nfl' : 'ncaaf');
    // A whole board mounts at once, so one upstream hiccup (ESPN 403, cold
    // lambda) used to blank the chip for good — cachedJson drops failures, so
    // a delayed retry re-requests instead of replaying the error.
    const load = (attempt: number) =>
      cachedJson<LedgerChipData>(url)
        .then((d) => { if (alive) setLedger(d); })
        .catch(() => {
          if (!alive) return;
          if (attempt < 2) setTimeout(() => { if (alive) load(attempt + 1); }, 1500 * (attempt + 1));
          else setLedger(null);
        });
    load(0);
    return () => { alive = false; };
  }, [isNCAAF, isNFL, game.away_team, game.home_team]);

  // Value side (or Ledger favorite when it agrees with the market) + the
  // Ledger spread from that team's perspective; null when either team is
  // outside the ratings.
  const ledgerChip = (() => {
    if (!ledger?.away?.matched || !ledger?.home?.matched) return null;
    // NFL: the matchup route flags the season's neutral games itself
    const homeSpread = neutralGame || ledger.isNeutralSite ? ledger.neutralSpread : ledger.homeSpread;
    if (homeSpread === null || homeSpread === undefined) return null;
    // Disagreement with the market: books' average spread, home perspective.
    // Tiers from the 2026 wk1-3 backtest (bet the Ledger side vs the close:
    // 1+ ~58%, 2+ ~60%, 3+ ~61%) — small sample, re-check as weeks accrue.
    const awayPoints = (game.bookmakers ?? [])
      .map((b) => b.markets.find((m) => m.key === 'spreads')?.outcomes.find((o) => o.name === game.away_team)?.point)
      .filter((p): p is number => typeof p === 'number');
    const marketHome = awayPoints.length ? -(awayPoints.reduce((a, b) => a + b, 0) / awayPoints.length) : null;
    const gap = marketHome === null ? null : Math.abs(homeSpread - marketHome);
    const tier: 'none' | 'low' | 'mid' | 'high' =
      gap === null || gap < 1 ? 'none' : gap < 2 ? 'low' : gap < 3 ? 'mid' : 'high';
    // Side shown: with a real disagreement, the team the Ledger rates better
    // than the market (the value side); otherwise the Ledger favorite.
    const showHome = tier !== 'none' && marketHome !== null
      ? homeSpread < marketHome
      : homeSpread <= 0;
    const teamName = showHome ? game.home_team : game.away_team;
    const side = showHome ? ledger.home : ledger.away;
    const espnLogo =
      side.logo ??
      (side.espnId && !isNFL ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${side.espnId}.png` : null);
    // Lines from the shown team's perspective, signed ("+3.0", "-10.4", "PK").
    const fmt = (v: number) => (v === 0 ? 'PK' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`);
    const sideLedger = showHome ? homeSpread : -homeSpread;
    const sideMarket = marketHome === null ? null : showHome ? marketHome : -marketHome;
    return {
      teamName,
      logos: [espnLogo, getTeamLogo(teamName)].filter((s): s is string => !!s),
      text: fmt(sideLedger),
      tier,
      gapText: gap === null || sideMarket === null
        ? 'no market line'
        : `market ${fmt(sideMarket)}, ${gap.toFixed(1)} pt gap${tier === 'none' ? '' : ' — value side'}`,
    };
  })();

  // Ledger chip colors by disagreement with the market: <1 gray, 1+ yellow,
  // 2+ blue, 3+ green. [resting, active (analysis panel open)].
  const LEDGER_TIER_CLASSES: Record<'none' | 'low' | 'mid' | 'high', [string, string]> = {
    none: ['bg-gray-100 text-gray-600 hover:bg-gray-200', 'bg-gray-600 text-white'],
    low: ['bg-yellow-100 text-yellow-800 hover:bg-yellow-200', 'bg-yellow-500 text-white'],
    mid: ['bg-blue-50 text-blue-700 hover:bg-blue-100', 'bg-blue-600 text-white'],
    high: ['bg-green-100 text-green-800 hover:bg-green-200', 'bg-green-600 text-white'],
  };

  const favoriteShareButtons = (
    <>
      {onToggleFavorite && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(game.id);
          }}
          className={`text-lg hover:scale-110 transition-transform ${
            isFavorite ? 'text-yellow-500' : 'text-gray-900 hover:text-yellow-400'
          }`}
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
      <button
        onClick={copyGameLink}
        className="ml-1 text-gray-400 hover:text-blue-500 hover:scale-110 transition-all"
        aria-label="Share game"
        title="Share game"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      </button>
      {canNote && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setNoteOpen(true);
          }}
          className={`ml-1 hover:scale-110 transition-all ${note ? 'text-amber-500 hover:text-amber-600' : 'text-gray-400 hover:text-blue-500'}`}
          aria-label={note ? 'Edit note' : 'Add note'}
          title={note ? 'Edit note' : 'Add note'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill={note ? 'currentColor' : 'none'} fillOpacity={note ? 0.18 : undefined} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </button>
      )}
    </>
  );

  // College team without its mascot ("West Virginia Mountaineers" → "West
  // Virginia"): ESPN's school name when the team is in the league map, else
  // the name minus its last word — or last two for the common two-word
  // mascots ("Yellow Jackets", "Sun Devils", …). Long schools then take their
  // short form ("Arizona State" → "Arizona St", "Florida International" → "FIU").
  const schoolName = (teamName: string): string => {
    const school = teamInfoFromMap(teamColorMap, teamName)?.school;
    if (school) return shortSchool(school);
    const words = teamName.trim().split(/\s+/);
    if (words.length < 2) return teamName;
    const drop = words.length > 2 && TWO_WORD_MASCOT_STARTS.has(words[words.length - 2].toLowerCase()) ? 2 : 1;
    return shortSchool(words.slice(0, -drop).join(' '));
  };
  // Pro team without its city ("Boston Red Sox" → "Red Sox"): the name minus
  // ESPN's location when the team is in the league map, else the last word —
  // or last two for the two-word mascots ("Blue Jays", "Maple Leafs").
  const mascotName = (teamName: string): string => {
    const city = teamInfoFromMap(teamColorMap, teamName)?.school;
    if (city && teamName.startsWith(city + ' ')) return teamName.slice(city.length + 1);
    const words = teamName.trim().split(/ +/);
    if (words.length < 2) return teamName;
    const keep = words.length > 2 && TWO_WORD_MASCOT_STARTS.has(words[words.length - 2].toLowerCase()) ? 2 : 1;
    return words.slice(-keep).join(' ');
  };
  const titleName = (teamName: string) => (isNCAAF ? schoolName(teamName) : mascotName(teamName));
  // Logo beside each team in that title: ESPN's from the league map, then
  // the live-score feed's, then the local file.
  const titleLogos = (teamName: string, side: 'away' | 'home') => [
    teamInfoFromMap(teamColorMap, teamName)?.logo,
    (side === 'away' ? liveScore?.awayLogo : liveScore?.homeLogo) ?? undefined,
    getTeamLogo(teamName),
  ];

  // Team name → ESPN abbreviation ("Carolina Panthers" → "CAR") from the
  // league team map the badge already loads for its color; first word of the
  // name until the map arrives or for leagues without abbreviations (soccer).
  const shortTeam = (teamName: string): string =>
    teamInfoFromMap(teamColorMap, teamName)?.abbreviation ?? getFirstWord(teamName);

  // Wager badge text: "Carolina Panthers -3.5" → "CAR -3.5" (both breakpoints);
  // the hover title keeps the full bet text. `compact` (mobile) also shortens
  // Over/Under → O/U and props to "Mahomes O 275.5".
  const badgeBetText = (bet: Bet, compact: boolean): string => {
    if (bet.betType === 'prop') {
      if (!compact) return bet.bet;
      // "Patrick Mahomes Over 275.5 Passing Yards" -> "Mahomes O 275.5"
      const m = bet.bet.match(/^(.+?)\s+(over|under)\s*([\d.]+)/i);
      if (m) {
        const last = m[1].trim().split(/\s+/).pop() ?? m[1];
        return `${last} ${m[2][0].toUpperCase()} ${m[3]}`;
      }
      return bet.bet;
    }
    const text = bet.bet
      .replace(game.away_team, shortTeam(game.away_team))
      .replace(game.home_team, shortTeam(game.home_team));
    return compact ? text.replace(/^Over\s+/i, 'O ').replace(/^Under\s+/i, 'U ') : text;
  };
  
  // Calculate implied scores based on average spread and total
  const calculateImpliedScores = () => {
    if (!game.bookmakers || game.bookmakers.length === 0) return null;
    
    // Collect all spreads and totals
    const spreads: number[] = [];
    const totals: number[] = [];
    let awayTeamName = '';
    let homeTeamName = '';
    
    game.bookmakers.forEach(bookmaker => {
      // Get spread market
      const spreadMarket = bookmaker.markets.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const awaySpread = spreadMarket.outcomes.find(o => o.name === game.away_team);
        const homeSpread = spreadMarket.outcomes.find(o => o.name === game.home_team);
        
        if (awaySpread && awaySpread.point !== undefined) {
          spreads.push(awaySpread.point);
          awayTeamName = game.away_team;
        }
        if (homeSpread && homeSpread.point !== undefined) {
          homeTeamName = game.home_team;
        }
      }
      
      // Get totals market
      const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
      if (totalsMarket) {
        const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
        if (overOutcome && overOutcome.point !== undefined) {
          totals.push(overOutcome.point);
        }
      }
    });
    
    // Need both spread and total to calculate
    if (spreads.length === 0 || totals.length === 0) return null;
    
    // Calculate averages
    const avgSpread = spreads.reduce((sum, s) => sum + s, 0) / spreads.length;
    const avgTotal = totals.reduce((sum, t) => sum + t, 0) / totals.length;
    
    // Calculate implied scores
    // If away team spread is negative, they're favored
    // Implied scores: Favorite gets (Total + |Spread|) / 2, Underdog gets (Total - |Spread|) / 2
    const awayImplied = (avgTotal - avgSpread) / 2;
    const homeImplied = (avgTotal + avgSpread) / 2;
    
    return {
      away: Math.round(awayImplied), // Round to whole number
      home: Math.round(homeImplied), // Round to whole number
      awayTeam: awayTeamName,
      homeTeam: homeTeamName,
      awayWinning: awayImplied > homeImplied
    };
  };
  
  const impliedScores = calculateImpliedScores();

  // Live and final score badges: the team that's ahead on the left (away first when tied)
  const awaySide = { logo: liveScore?.awayLogo || getTeamLogo(game.away_team), score: liveScore?.awayScore };
  const homeSide = { logo: liveScore?.homeLogo || getTeamLogo(game.home_team), score: liveScore?.homeScore };
  const homeLeads = Number(liveScore?.homeScore) > Number(liveScore?.awayScore);
  const [liveLeft, liveRight] = homeLeads ? [homeSide, awaySide] : [awaySide, homeSide];

  // Open/close spread + total (NFL + NCAAF) for the odds table's first column, left of
  // the books: the opener before kickoff, the close once the game has started
  // (game_line_openers, src/lib/lineOpeners.ts), rounded to the half point. No
  // conditional color (Tyler, 2026-09-27) — just the number.
  const [opener, setOpener] = useState<{ homeSpread: number; capturedAt: string; closeHomeSpread: number | null; openTotal?: number | null; closeTotal?: number | null } | null>(null);
  useEffect(() => {
    if (game.sport_key !== 'americanfootball_nfl' && !isNCAAF) return;
    let alive = true;
    cachedJson<Record<string, { homeSpread: number; capturedAt: string; closeHomeSpread: number | null; openTotal?: number | null; closeTotal?: number | null }>>(`/api/line-openers?sport=${game.sport_key}`)
      .then((m) => { if (alive) setOpener(m?.[game.id] ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [game.sport_key, game.id, isNCAAF]);
  const gameStarted = now > gameDate;
  const openLine = (() => {
    if (!opener) return null;
    const half = (v: number) => Math.round(v * 2) / 2;
    const h = (v: number | null | undefined) => (v === null || v === undefined ? null : half(v));
    if (gameStarted) {
      const homeSpread = h(opener.closeHomeSpread);
      const total = h(opener.closeTotal);
      if (homeSpread === null && total === null) return null;
      return { kind: 'close' as const, homeSpread, total, openedOn: '' };
    }
    return {
      kind: 'open' as const,
      homeSpread: half(opener.homeSpread),
      total: h(opener.openTotal),
      openedOn: new Date(opener.capturedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }),
    };
  })();

  // Ledger chip - value side's logo + Ledger spread from its perspective
  // ("+3.0"), colored by gap vs market; opens the Ledger tab. Rendered right
  // after the implied/proj score on every breakpoint (was the button row on
  // mobile until 2026-10-04).
  // Starting QB out/doubtful (NFL) - the usual reason the Ledger (which
  // doesn't know about injuries) sits far from the market.
  const [qbOut, setQbOut] = useState<{ away: InjuryEntry | null; home: InjuryEntry | null }>({ away: null, home: null });
  useEffect(() => {
    if (!isNFL) return;
    let alive = true;
    loadInjuries().then((teams) => {
      if (alive) setQbOut({ away: startingQbOut(teams[game.away_team]), home: startingQbOut(teams[game.home_team]) });
    });
    return () => { alive = false; };
  }, [isNFL, game.away_team, game.home_team]);
  const renderQbOut = () =>
    isNFL &&
    (['away', 'home'] as const).map((side) => {
      const qb = qbOut[side];
      if (!qb) return null;
      const team = side === 'away' ? game.away_team : game.home_team;
      const logo = (side === 'away' ? liveScore?.awayLogo : liveScore?.homeLogo) || getTeamLogo(team);
      const lastName = qb.name.split(' ').slice(1).join(' ') || qb.name;
      return (
        <button
          key={side}
          onClick={() => {
            setNflPanel('injuries');
            setExpandedMarket('analysis');
          }}
          className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200"
          title={`Starting QB ${qb.name}: ${qb.status}${qb.comment ? ` - ${qb.comment}` : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" className="h-3.5 w-3.5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>QB {lastName} {injuryStatusLabel(qb.status)}</span>
        </button>
      );
    });

  // Wager badges for this game — strong team-color border + light fill; full
  // text on desktop, abbreviated on phones.
  const groupKey = (bet: Bet) => betGroupKey(bet, game.away_team, game.home_team);
  // Friends' bets by chip: same side of the same market shares one chip
  const friendGroups = new Map<string, FriendBet[]>();
  for (const f of friendBets) {
    const key = groupKey(f.bet);
    friendGroups.set(key, [...(friendGroups.get(key) ?? []), f]);
  }
  // The photos for a chip: one per person, three at most
  const chipFriends = (key: string) => {
    const people = Array.from(new Map((friendGroups.get(key) ?? []).map((f) => [f.owner.id, f.owner])).values()).slice(0, 3);
    return {
      count: people.length,
      names: people.map((p) => p.displayName || `@${p.handle}`).join(', '),
      avatars: people.map((p, i) => (
        <FriendAvatar key={p.id} profile={p} className={`h-4 w-4 flex-none text-[8px] ring-2 ring-white ${i > 0 ? '-ml-1.5' : ''}`} />
      )),
    };
  };
  const togglePanel = (key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setFriendPanel((open) => (open === key ? null : key));
  };

  const myKeysShown = new Set<string>();
  const myBadges = myPendingBets.map(bet => {
    const accent = wageredTeamColor(bet, teamColorMap, game.away_team, game.home_team);
    // A friend on the same bet as mine rides on my badge (the first, if I have two)
    const key = groupKey(bet);
    const shared = friendGroups.has(key) && !myKeysShown.has(key) ? chipFriends(key) : null;
    myKeysShown.add(key);
    return (
      <MyBetBadge
        key={bet.id}
        accent={accent}
        status={bet.status}
        title={`Your bet: ${bet.bet}${bet.book ? ` (${bet.book})` : ''}${bet.status !== 'pending' ? ` — ${bet.status}` : ''}${shared ? ` · also ${shared.names}` : ''}`}
        avatars={shared?.avatars}
        avatarCount={shared?.count}
        onClick={shared ? togglePanel(key) : undefined}
        pressed={shared ? friendPanel === key : undefined}
      >
        <span className="hidden md:inline whitespace-nowrap">{badgeBetText(bet, false)}</span>
        <span className="md:hidden whitespace-nowrap">{badgeBetText(bet, true)}</span>
      </MyBetBadge>
    );
  });
  // Bets only friends have: two chips at most, the rest behind "+N"
  const friendOnlyKeys = Array.from(friendGroups.keys()).filter((key) => !myKeysShown.has(key));
  const friendBadges = friendOnlyKeys.slice(0, 2).map((key) => {
    const bet = friendGroups.get(key)![0].bet;
    const who = chipFriends(key);
    return (
      <MyBetBadge
        key={key}
        friend
        accent={wageredTeamColor(bet, teamColorMap, game.away_team, game.home_team)}
        title={`${who.names}: ${bet.bet}`}
        avatars={who.avatars}
        avatarCount={who.count}
        onClick={togglePanel(key)}
        pressed={friendPanel === key}
      >
        <span className="hidden md:inline whitespace-nowrap">{badgeBetText(bet, false)}</span>
        <span className="md:hidden whitespace-nowrap">{badgeBetText(bet, true)}</span>
      </MyBetBadge>
    );
  });
  const hiddenFriendChips = friendOnlyKeys.length - friendBadges.length;
  const betBadges = [
    ...myBadges,
    ...friendBadges,
    ...(hiddenFriendChips > 0
      ? [
          <button
            key="more-friends"
            type="button"
            onClick={togglePanel('all')}
            aria-expanded={friendPanel === 'all'}
            title="More bets from people you follow"
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] md:text-xs font-semibold text-slate-600 hover:bg-slate-200"
          >
            +{hiddenFriendChips}
          </button>,
        ]
      : []),
  ];
  const friendPanelBets = friendPanel === 'all' ? friendBets : friendPanel ? friendGroups.get(friendPanel) ?? [] : [];

  const renderLedgerChip = (placement: string) => (isNCAAF || isNFL) && ledgerChip && prefs.showProjections && (
    <button
      className={`${placement} items-center gap-1 px-1.5 md:px-2 py-1 text-xs md:text-sm font-semibold rounded-md tabular-nums ${
        LEDGER_TIER_CLASSES[ledgerChip.tier][
          expandedMarket === 'analysis' &&
          (isNFL ? nflPanel === 'ledger' : analysisTabRequest.tab === 'Ledger')
            ? 1
            : 0
        ]
      }`}
      onClick={() => {
        if (isNFL) {
          setNflPanel('ledger');
          setExpandedMarket('analysis');
        } else {
          openAnalysis('Ledger');
        }
      }}
      title={`Ledger projection: ${ledgerChip.teamName} ${ledgerChip.text} (${ledgerChip.gapText})`}
      aria-label={`Ledger projection: ${ledgerChip.teamName} ${ledgerChip.text}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ledgerChip.logos[0]}
        alt=""
        className="h-4 w-4 object-contain"
        onError={(e) => {
          const img = e.currentTarget;
          const next = ledgerChip.logos[ledgerChip.logos.indexOf(img.getAttribute('src') ?? '') + 1];
          if (next) img.src = next;
          else img.style.visibility = 'hidden';
        }}
      />
      <span>{ledgerChip.text}</span>
    </button>
  );

  
  return (
    <div 
      id={`game-${game.id}`}
      className={`relative bg-white rounded-lg shadow-md mb-6 overflow-hidden transition-all duration-500 ${
        isHighlighted ? 'ring-2 ring-blue-500 ring-offset-2' : ''
      }`}
    >
      {/* Link copied toast */}
      {noteOpen && (
        <GameNoteSheet
          gameId={game.id}
          label={`${game.away_team} @ ${game.home_team}`}
          commenceTime={game.commence_time}
          initial={note}
          onClose={() => setNoteOpen(false)}
        />
      )}
      {tailTicket && <BetTicket pick={tailTicket} onClose={() => setTailTicket(null)} />}
      {showLinkCopied && (
        <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 bg-gray-800 text-white text-xs rounded-full">
          Link copied!
        </div>
      )}
      <div className="p-3 md:p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between">
          <div className="mb-2 sm:mb-0">
            {/* Team names row — nowrap: names truncate instead of pushing the
                icons onto their own line; icons right edge on mobile, inline on sm+ */}
            <div className="flex items-center">
              <h3 className="text-[15px] md:text-[18px] font-semibold tracking-[-0.3px] md:tracking-[-0.45px] text-gray-900 truncate min-w-0">
                {isNCAAF || isMascotTitle ? (
                  // Phones: logo + short name only — college = school, "State" shortened
                  // ("Arizona St @ West Virginia"); the pro leagues = mascot ("Bills @ Chiefs").
                  // The full names are what overflowed the line
                  <>
                    <span className="md:hidden flex items-center gap-1.5 min-w-0">
                      <TeamLogoImg srcs={titleLogos(game.away_team, 'away')} className="h-5 w-5 flex-none object-contain" />
                      <span className="truncate">{titleName(game.away_team)}</span>
                      <span className="flex-none text-gray-400">@</span>
                      <TeamLogoImg srcs={titleLogos(game.home_team, 'home')} className="h-5 w-5 flex-none object-contain" />
                      <span className="truncate">{titleName(game.home_team)}</span>
                    </span>
                    <span className="hidden md:inline">{game.away_team} @ {game.home_team}</span>
                  </>
                ) : (
                  <>{game.away_team} @ {game.home_team}</>
                )}
              </h3>
              {/* Bad weather at kickoff: icons right of the names; tap for the numbers */}
              {badWeather && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWeather((v) => !v);
                  }}
                  aria-expanded={showWeather}
                  aria-label={`Weather: ${weatherHeadline(badWeather.flags)}. Tap for details`}
                  title={`${weatherHeadline(badWeather.flags)} expected`}
                  className={`ml-1.5 flex flex-none items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors ${showWeather ? 'bg-slate-100' : 'hover:bg-slate-100'}`}
                >
                  <WeatherIcons flags={badWeather.flags} />
                </button>
              )}
              <span className="ml-auto pl-2 sm:ml-2 sm:pl-0 flex items-center flex-shrink-0">
                {favoriteShareButtons}
              </span>
              {/* Desktop only: Live/Final scores inline with team names */}
              <div className="hidden md:inline-flex">
                {/* Live indicator with score */}
                {isLive && liveScore && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1.5 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    <img 
                      src={liveLeft.logo}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveLeft.score}</span>
                    <span className="mx-1">-</span>
                    <span className="font-bold">{liveRight.score}</span>
                    <img 
                      src={liveRight.logo}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1.5 text-green-600">{liveScore.statusDetail}</span>
                  </span>
                )}
                {/* Final score */}
                {isCompleted && liveScore && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    <img 
                      src={liveLeft.logo}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveLeft.score}</span>
                    <span className="mx-1">-</span>
                    <span className="font-bold">{liveRight.score}</span>
                    <img 
                      src={liveRight.logo}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1.5 text-gray-500">Final</span>
                  </span>
                )}
                {/* Show LIVE badge without score if game started but no ESPN match */}
                {!liveScore && now > gameDate && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>
            </div>
            
            {/* Second row: Game time (pre-game) OR Live/Final + Implied scores (mobile on same line) */}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {/* Only show game time if not live/completed */}
              {!isLive && !isCompleted && (
                <p className="text-xs md:text-sm text-gray-500">
                  {/* date • time zone — a light dot, not the word "at" */}
                  {mounted ? (
                    <>
                      {formattedDate}
                      <span className="mx-1.5 text-gray-300" aria-hidden="true">•</span>
                      {formattedTime} {timeZoneAbbr}
                    </>
                  ) : ' '}
                </p>
              )}

              {/* Neutral site — no home-field edge is applied to this game.
                  Click for venue detail (inline, not a popover: the card is
                  overflow-hidden and would clip an absolutely-positioned one). */}
              {neutralGame && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowVenue(!showVenue); }}
                  aria-expanded={showVenue}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    showVenue
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Neutral
                  {neutralGame.venue && (
                    <span className={`hidden md:inline ${showVenue ? 'text-slate-300' : 'text-slate-400'}`}>
                      · {neutralGame.venue}
                    </span>
                  )}
                </button>
              )}

              {/* My wager badge(s). Desktop: here on the date line. Phones: beside the
                  Spread / ML / O/U buttons below, so they never take a line of their own. */}
              <span className="hidden md:flex items-center gap-1.5 flex-wrap empty:hidden">{betBadges}</span>
              
              {/* Mobile only: Live/Final scores */}
              <div className="md:hidden flex items-center">
                {/* Live indicator with score */}
                {isLive && liveScore && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    <img 
                      src={liveLeft.logo}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveLeft.score}</span>
                    <span className="mx-0.5">-</span>
                    <span className="font-bold">{liveRight.score}</span>
                    <img 
                      src={liveRight.logo}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1 text-green-600">{liveScore.statusDetail}</span>
                  </span>
                )}
                {/* Final score */}
                {isCompleted && liveScore && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                    <img 
                      src={liveLeft.logo}
                      alt=""
                      className="h-4 w-4 mr-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="font-bold">{liveLeft.score}</span>
                    <span className="mx-0.5">-</span>
                    <span className="font-bold">{liveRight.score}</span>
                    <img 
                      src={liveRight.logo}
                      alt=""
                      className="h-4 w-4 ml-0.5"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    <span className="ml-1 text-gray-500">Final</span>
                  </span>
                )}
                {/* Show LIVE badge without score if game started but no ESPN match */}
                {!liveScore && now > gameDate && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    <span className="mr-1 w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                    LIVE
                  </span>
                )}
              </div>
              
              {/* Implied Score - always show, inline after date/time + ticket */}
              {impliedScores && (
                <div className="flex items-center gap-1 text-xs md:text-sm">
                  {!isLive && !isCompleted && <span className="text-gray-400 hidden md:inline">•</span>}
                  {(isLive || isCompleted) && liveScore && <span className="text-gray-400">•</span>}
                  <span className="text-gray-600 flex items-center gap-0.5">
                    <span className="text-gray-500">{gameStarted ? 'Proj:' : 'Implied:'}</span>
                    {impliedScores.awayWinning ? (
                      <>
                        <img 
                          src={liveScore?.awayLogo || getTeamLogo(impliedScores.awayTeam)}
                          alt={getFirstWord(impliedScores.awayTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="font-bold">{impliedScores.away}</span>
                        <span>-</span>
                        <img 
                          src={liveScore?.homeLogo || getTeamLogo(impliedScores.homeTeam)}
                          alt={getFirstWord(impliedScores.homeTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{impliedScores.home}</span>
                      </>
                    ) : (
                      <>
                        <img 
                          src={liveScore?.homeLogo || getTeamLogo(impliedScores.homeTeam)}
                          alt={getFirstWord(impliedScores.homeTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span className="font-bold">{impliedScores.home}</span>
                        <span>-</span>
                        <img 
                          src={liveScore?.awayLogo || getTeamLogo(impliedScores.awayTeam)}
                          alt={getFirstWord(impliedScores.awayTeam)}
                          className="h-3.5 w-3.5 object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <span>{impliedScores.away}</span>
                      </>
                    )}
                  </span>
                  {/* Ledger chip glued to the implied/proj score (both breakpoints)
                      so the two wrap as one unit on narrow phones */}
                  {renderLedgerChip('inline-flex ml-1')}
                </div>
              )}

              {/* No implied score (no books yet): chip stands on its own */}
              {!impliedScores && renderLedgerChip('inline-flex')}
            </div>

            {/* Venue detail — expanded by the Neutral badge */}
            {neutralGame && showVenue && (
              <div className="mt-1.5 inline-flex flex-col gap-0.5 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-slate-800">
                  {neutralGame.venue ?? 'Neutral site'}
                </span>
                {venueLocation(neutralGame) && (
                  <span className="text-slate-600">{venueLocation(neutralGame)}</span>
                )}
                <span className="text-slate-400 text-[11px]">
                  {[
                    neutralGame.dome === true ? 'Dome' : neutralGame.dome === false ? 'Outdoor' : null,
                    neutralGame.capacity ? `${neutralGame.capacity.toLocaleString()} cap` : null,
                    neutralGame.elevationFt && neutralGame.elevationFt >= 3000
                      ? `${neutralGame.elevationFt.toLocaleString()} ft elevation`
                      : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
            {/* Weather details, opened from the icons in the title row */}
            {badWeather && showWeather && (
              <div className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs leading-snug text-slate-600">
                <span className="font-semibold text-slate-800">{weatherHeadline(badWeather.flags)} expected.</span>{' '}
                {weatherFacts(badWeather).join(' · ')}
                <span className="block text-[11px] text-slate-400">
                  Forecast for {game.sport_key === 'baseball_mlb' ? 'first pitch' : 'kickoff'} and the three hours after{badWeather.venue ? ` · ${badWeather.venue}` : ''}{badWeather.city ? `, ${badWeather.city}` : ''}
                </span>
              </div>
            )}
            {/* Who bet what, opened from a badge that carries friends' photos */}
            {friendPanelBets.length > 0 && (
              <FriendBetsPanel entries={friendPanelBets} game={game} selectedBookmakers={selectedBookmakers} onTail={setTailTicket} />
            )}
            {/* My note, when there is one: a single quiet line; tap to edit */}
            {note && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setNoteOpen(true);
                }}
                title={note}
                className="mt-1.5 flex max-w-full items-start gap-1.5 text-left text-xs text-gray-600 hover:text-gray-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-px h-3.5 w-3.5 flex-none text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
                </svg>
                <span className="line-clamp-1">{note}</span>
              </button>
            )}
          </div>

          {/* Market toggle buttons (+ NFL injury icon and starting-QB-out chip;
              wraps so two QB chips never overflow a phone) */}
          <div className="flex flex-wrap items-center gap-1 md:gap-2">
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'spread' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('spread')}
            >
              Spread
            </button>
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'moneyline' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('moneyline')}
            >
              {isSoccer ? '1X2' : 'ML'}
            </button>
            <button 
              className={`px-2 md:px-3 py-1 text-xs md:text-sm rounded-md ${
                expandedMarket === 'totals' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
              onClick={() => setExpandedMarket('totals')}
            >
              O/U
            </button>
            {/* Analysis button - only for NCAAF */}
            {isNCAAF && prefs.showProjections && (
              <button 
                className={`inline-flex items-center px-2 md:px-3 py-1 rounded-md ${
                  expandedMarket === 'analysis'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                }`}
                onClick={() => openAnalysis('Summary')}
                title="Analysis"
                aria-label="Analysis"
              >
                {/* Bar chart in the site blue (16px / 20px = the text buttons' line height) */}
                <svg className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="3.5" y="13" width="4.5" height="7.5" rx="1" />
                  <rect x="9.75" y="4" width="4.5" height="16.5" rx="1" />
                  <rect x="16" y="9" width="4.5" height="11.5" rx="1" />
                </svg>
              </button>
            )}
            {/* Injury report button - only for NFL */}
            {isNFL && (
              <button
                className={`inline-flex items-center px-2 md:px-3 py-1 rounded-md ${
                  expandedMarket === 'analysis' && nflPanel === 'injuries'
                    ? 'bg-red-600 text-white'
                    : 'bg-red-50 text-red-600 hover:bg-red-100'
                }`}
                onClick={() => {
                  setNflPanel('injuries');
                  setExpandedMarket('analysis');
                }}
                title="Injury report"
                aria-label="Injury report"
              >
                {/* Medical cross, in the red of the QB-out chip beside it (16px / 20px = the text buttons' line height) */}
                <svg className="h-4 w-4 md:h-5 md:w-5 p-px" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9.5 3h5a1 1 0 0 1 1 1v4.5H20a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-4.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-4.5H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h4.5V4a1 1 0 0 1 1-1z" />
                </svg>
              </button>
            )}
            {/* Starting QB out/doubtful — sits right of the injury icon it opens */}
            {renderQbOut()}
            {/* Phones: my wager badge(s), last in the row (the row wraps if it runs long) */}
            <span className="md:hidden flex items-center gap-1.5 flex-wrap empty:hidden">{betBadges}</span>
          </div>
        </div>
      </div>

      {/* NFL analysis: injury report or the Ledger projection */}
      {expandedMarket === 'analysis' && isNFL ? (
        <div>
          <div className="flex gap-1 border-b border-gray-200 px-3 pt-1">
            {(['injuries', 'ledger'] as const).filter((p) => p !== 'ledger' || prefs.showProjections).map((p) => (
              <button
                key={p}
                onClick={() => setNflPanel(p)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors ${
                  nflPanel === p
                    ? 'bg-purple-100 text-purple-800 border border-b-0 border-gray-200'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {p === 'injuries' ? 'Injuries' : 'Ledger'}
              </button>
            ))}
          </div>
          {nflPanel === 'ledger' ? (
            <LedgerMatchup awayTeam={game.away_team} homeTeam={game.home_team} league="nfl" />
          ) : (
            <InjuryReport awayTeam={game.away_team} homeTeam={game.home_team} />
          )}
        </div>
      ) : /* Show TeamAnalysis if analysis is selected */
      expandedMarket === 'analysis' && isNCAAF ? (
        <div className="p-2">
          <AnalysisTabs
            awayTeam={game.away_team}
            homeTeam={game.home_team}
            isNeutralSite={!!neutralGame}
            tabRequest={analysisTabRequest}
            venue={
              neutralGame
                ? [neutralGame.venue, venueLocation(neutralGame)].filter(Boolean).join(', ')
                : null
            }
          />
        </div>
      ) : (
        <OddsTable
          games={[game]}
          view={expandedMarket === 'analysis' ? 'spread' : expandedMarket}
          selectedBookmakers={selectedBookmakers}
          league={game.sport_key}
          awayLogo={liveScore?.awayLogo}
          homeLogo={liveScore?.homeLogo}
          restData={restData}
          isLive={isLive}
          openLine={openLine}
        />
      )}
    </div>
  );
}
