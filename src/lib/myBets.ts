// src/lib/myBets.ts

export type BetStatus = 'pending' | 'won' | 'lost' | 'push';
export type BetType = 'spread' | 'moneyline' | 'total' | 'prop' | 'parlay' | 'future';

export interface Bet {
  id: string;
  date: string; // ISO date string - when bet was placed
  eventDate: string; // ISO date string - when the game/event happens
  sport: string;
  league: string;
  description: string; // e.g., "Lakers vs Celtics"
  awayTeam?: string; // Optional: parsed away team
  homeTeam?: string; // Optional: parsed home team
  betType: BetType;
  bet: string; // e.g., "Lakers -5.5", "Over 220.5", "Celtics ML"
  odds: number; // American odds format
  stake: number;
  status: BetStatus;
  result?: string; // Optional: final score or result
  notes?: string; // Optional: any notes about the bet
  book?: string; // Optional: which sportsbook
  team?: string;  // ← ADD THIS LINE for futures logos
}

// HARD-CODED BETS - Update this array with your actual bets
export const myBets: Bet[] = [
  // Example bets - replace with your actual bets
  {
    id: '1',
    date: '2025-05-13',  // When you placed the bet
    eventDate: '2025-10-12',  // When the game happens
    sport: 'Football',
    league: 'NFL',
    description: 'Denver Broncos @ New York Jets',
    betType: 'parlay',
    bet: 'Oklahoma City Thunder WC Champions, Denver Broncos ML',
    odds: -102,
    stake: 1.36,
    awayTeam: 'Denver Broncos',
    homeTeam: 'New York Jets',
    status: 'pending',
    book: 'FanDuel'
  },
  {
    id: '2',
    date: '2025-05-23',
    eventDate: '2026-01-19',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Southern Miss Sunbelt Champion',
    betType: 'future',
    team: 'Southern Mississippi Golden Eagles',
    bet: 'Southern Miss Sunbelt Champion',
    odds: +2800,
    stake: .5,
    status: 'pending',
    book: 'FanDuel'
  },
  {
    id: '3',
    date: '2025-08-19',
    eventDate: '2025-08-30',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Syracuse Orange vs Tennessee Volunteers',
    awayTeam: 'Syracuse Orange',
    homeTeam: 'Tennessee Volunteers',
    betType: 'spread',
    bet: 'Syracuse +14',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Reports Tenn offense and specifically passing game looking really rough. Syracuse should be okay offensively. Game 1',
    book: 'BetMGM'
  },
    {
    id: '7',
    date: '2025-08-05',
    eventDate: '2025-08-28',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Wyoming Cowboys vs Akron Zips',
    awayTeam: 'Wyoming Cowboys',
    homeTeam: 'Akron Zips',
    betType: 'spread',
    bet: 'Wyoming -6.5',
    odds: -120,
    stake: 1.20,
    status: 'pending',
    result: 'pending',
    notes: 'Akron should be rough. Not super high on Wyoming though. Would not lay over a TD',
    book: 'FanDuel'
  },
     {
    id: '8',
    date: '2025-08-02',
    eventDate: '2025-08-29',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Georgia Tech Yellow Jackets vs Colorado Buffaloes',
    awayTeam: 'Georgia Tech Yellow Jackets',
    homeTeam: 'Colorado Buffaloes',
    betType: 'spread',
    bet: 'Colorado +4.5',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Never advantageous for an ET team to head to altitude especially in week one. Tons of line improvement for CU, QB potential but unknown. Very coinflipy, point and the home dog seems right',
    book: 'FanDuel'
  },
       {
    id: '9',
    date: '2025-07-29',
    eventDate: '2025-08-30',
    sport: 'Football',
    league: 'NCAAF',
    description: 'California Golden Bears vs Oregon State Beavers',
    awayTeam: 'California Golden Bears',
    homeTeam: 'Oregon State Beavers',
    betType: 'spread',
    bet: 'Oregon St -2.5',
    odds: -118,
    stake: 1.18,
    status: 'pending',
    result: 'pending',
    notes: 'Cal should be pretty awful this year. Higher on the Beavers, at home.',
    book: 'FanDuel'
  },
        {
    id: '10',
    date: '2025-07-17',
    eventDate: '2025-08-23',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Sam Houston State Bearkats @ Western Kentucky Hilltoppers',
    awayTeam: 'Sam Houston State Bearkats',
    homeTeam: 'Western Kentucky Hilltoppers',
    betType: 'total',
    bet: 'Over 59.5',
    odds: -105,
    stake: 1.05,
    status: 'pending',
    result: 'pending',
    notes: 'Totally different Bearkats team this year. Offense should put up way more points. WKU fine on Offense',
    book: 'FanDuel'
  },
         {
    id: '11',
    date: '2025-07-15',
    eventDate: '2025-09-06',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Michigan Wolverines @ Oklahoma Sooners',
    awayTeam: 'Michigan Wolverines',
    homeTeam: 'Oklahoma Sooners',
    betType: 'total',
    bet: 'Under 47.5',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Defenses should be improved, big game',
    book: 'FanDuel'
  },
           {
    id: '12',
    date: '2025-06-29',
    eventDate: '2025-08-30',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Toledo Rockets @ Kentucky Wildcats',
    awayTeam: 'Toledo Rockets',
    homeTeam: 'Kentucky Wildcats',
    betType: 'spread',
    bet: 'Toledo +10.5',
    odds: -115,
    stake: 1.15,
    status: 'pending',
    result: 'pending',
    notes: 'Toledo likely best team in the MAC. Kentucky lots of issues. Last year Toledo pounded an SEC team right off the bat. Catching DD seems worthwhile',
    book: 'FanDuel'
  },
  {
    id: '4',
    date: '2025-05-31',
    eventDate: '2026-01-16',
    sport: 'football',
    league: 'NCAAF',
    description: 'Clemson Tigers National Champion',
    betType: 'future',
    team: 'Clemson Tigers',
    bet: 'Mets ML, Scheffler Win, OKC NBA Champ, Clemson Tigers CFP Champion',
    odds: +6459,
    stake: .167,
    status: 'pending',
    result: 'pending',
    book: 'FanDuel'
  },
  {
    id: '5',
    date: '2025-05-30',
    eventDate: '2026-01-19',  // Future heisman date
    sport: 'Football',
    league: 'NCAAF',
    description: 'Devon Dampier Heisman',
    betType: 'future',
    bet: 'Devon Dampier (Utah) Heisman',
    team: 'Utah Utes',
    odds: +18875,
    stake: .07,
    status: 'pending',
    notes: 'If Utah makes a run, it will be because of him. Dynamic player moving up from New Mexico',
    book: 'FanDuel'
  },
  {
    id: '6',
    date: '2025-05-31',
    eventDate: '2026-02-08',
    sport: 'Football',
    league: 'NFL',
    description: 'Buffalo Bills Superbowl',
    betType: 'future',
    team: 'Buffalo Bills',
    bet: 'Scottie Sheffler Win, Buffalo Bills Superbowl',
    odds: +2237,
    stake: .6,
    status: 'pending',
    book: 'DraftKings'
  },
    {
    id: '13',
    date: '2025-05-31',
    eventDate: '2026-01-19',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Fresno State MWC Champion',
    betType: 'future',
    team: 'Fresno State Bulldogs',
    bet: 'Fresno State MWC Champion',
    odds: +1000,
    stake: .67,
    status: 'pending',
    book: 'DraftKings'
  },
   {
    id: '14',
    date: '2025-07-01',
    eventDate: '2026-02-08',
    sport: 'Football',
    league: 'NFL',
    description: 'Baltimore Ravens Superbowl',
    betType: 'future',
    team: 'Baltimore Ravens',
    bet: 'Novak Djokovic reach Semis, Baltimore Ravens Superbowl',
    odds: +1395,
    stake: 1,
    status: 'pending',
    book: 'DraftKings'
  },
     {
    id: '15',
    date: '2025-08-05',
    eventDate: '2026-02-08',
    sport: 'Football',
    league: 'NCAAF',
    description: 'North Texas American Conf Champion',
    betType: 'future',
    bet: 'North Texas American Champion',
    team: 'North Texas Mean Green',
    odds: +3134,
    stake: .27,
    status: 'pending',
    book: 'DraftKings'
  },
           {
    id: '16',
    date: '2025-07-22',
    eventDate: '2025-08-28',
    sport: 'Football',
    league: 'NCAAF',
    description: 'Buffalo Bulls @ Minnesota Golden Gophers',
    awayTeam: 'Buffalo Bulls',
    homeTeam: 'Minnesota Golden Gophers',
    betType: 'spread',
    bet: 'Buffalo +17.5',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Buffalo a MAC Championship sleeper. Minnesota likely not great, first game of the year, big spread. Minnesota plodding offense',
    book: 'DraftKings'
  },
             {
    id: '17',
    date: '2025-05-28',
    eventDate: '2025-08-28',
    sport: 'Football',
    league: 'NCAAF',
    description: 'East Carolina Pirates @ NC State Wolfpack',
    awayTeam: 'East Carolina Pirates',
    homeTeam: 'NC State Wolfpack',
    betType: 'spread',
    bet: 'East Carolina +12.5',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Interstate rivalry, fiesty ECU team. Underwhelmed with what NC State has this year',
    book: 'DraftKings'
  },
             {
    id: '18',
    date: '2025-07-23',
    eventDate: '2025-09-14',
    sport: 'Football',
    league: 'NFL',
    description: 'Denver Broncos @ Indianapolis Colts',
    awayTeam: 'Denver Broncos',
    homeTeam: 'Indianapolis Colts',
    betType: 'spread',
    bet: 'Denver Broncos -3.5',
    odds: -110,
    stake: 1.10,
    status: 'pending',
    result: 'pending',
    notes: 'Denver vs Anthony Richardson? Yes, please',
    book: 'DraftKings'
  },
  {
    id: '19',
    date: '2025-08-14',
    eventDate: '2026-02-05',  // Future heisman date
    sport: 'Football',
    league: 'NFL',
    description: 'Aaron Glenn CoY',
    betType: 'future',
    bet: 'Aaron Glenn (NYJ) Coach of the Year',
    team: 'New York Jets',
    odds: +1600,
    stake: .67,
    status: 'pending',
    notes: 'NYJ roster is solid. If QB can produce at all, could outperform wins by a lot',
    book: 'FanDuel'
  },
    {
    id: '20',
    date: '2025-04-20',
    eventDate: '2026-01-05',  // Future heisman date
    sport: 'Football',
    league: 'NCAAF',
    description: 'Utah Big XII Champs',
    betType: 'future',
    bet: 'Utah Big XII Champs',
    team: 'Utah Utes',
    odds: +1800,
    stake: 1.43,
    status: 'pending',
    notes: 'Why not Utah?',
    book: 'BetRivers'
  },
               {
    id: '21',
    date: '2025-08-4',
    eventDate: '2025-08-29',
    sport: 'Football',
    league: 'NCAAF',
    description: 'UNLV Rebels @ Sam Houston State Bearkats',
    awayTeam: 'UNLV Rebels',
    homeTeam: 'Sam Houston State Bearkats',
    betType: 'spread',
    bet: 'UNLV -12',
    odds: -113,
    stake: 1.13,
    status: 'pending',
    result: 'pending',
    notes: 'UNLV should have their way on offense',
    book: 'BetRivers'
  },
      {
    id: '22',
    date: '2025-08-04',
    eventDate: '2025-11-28',  // Future heisman date
    sport: 'Football',
    league: 'NCAAF',
    description: 'San Jost St to make MWC Championship',
    betType: 'future',
    bet: 'SJ St make MWC Championship, Den ov Ten, Bal ov Cle, Buf ov Mia',
    team: 'San Jose State Spartans',
    odds: +397,
    stake: 1.67,
    status: 'pending',
    notes: 'Extremely favorable MWC Schedule',
    book: 'DraftKings'
  },
        {
    id: '23',
    date: '2025-08-02',
    eventDate: '2026-1-01',  // Future heisman date
    sport: 'Football',
    league: 'NCAAF',
    description: 'Boise St MWC Conf Champion',
    betType: 'future',
    bet: 'Boise St MWC Champions, Cam Young win',
    team: 'Boise State Broncos',
    odds: +177,
    stake: 3.75,
    status: 'pending',
    notes: 'Best team in MWC',
    book: 'FanDuel'
  },
  // Example with explicit team names for college logos:
  // {
  //   id: '7',
  //   date: '2025-01-19',  // Bet placed
  //   eventDate: '2025-01-20',  // Game day
  //   sport: 'Football',
  //   league: 'NCAAF',
  //   description: 'Alabama @ Georgia',
  //   awayTeam: 'Alabama Crimson Tide',
  //   homeTeam: 'Georgia Bulldogs',
  //   betType: 'spread',
  //   bet: 'Alabama +3.5',
  //   odds: -110,
  //   stake: 110,
  //   status: 'pending',
  //   book: 'FanDuel'
  // },
];

// Helper functions for bet calculations
export function calculatePayout(stake: number, odds: number): number {
  if (odds > 0) {
    // Positive odds: profit = stake * (odds/100)
    return stake + (stake * (odds / 100));
  } else {
    // Negative odds: profit = stake / (odds/-100)
    return stake + (stake / (Math.abs(odds) / 100));
  }
}

export function calculateProfit(stake: number, odds: number): number {
  return calculatePayout(stake, odds) - stake;
}

export function getBetStats(bets: Bet[]) {
  const completedBets = bets.filter(b => b.status !== 'pending');
  const wonBets = bets.filter(b => b.status === 'won');
  const lostBets = bets.filter(b => b.status === 'lost');
  const pushBets = bets.filter(b => b.status === 'push');
  const pendingBets = bets.filter(b => b.status === 'pending');

  let totalStaked = 0;
  let totalReturned = 0;
  let pendingStake = 0;
  let pendingPotentialPayout = 0;

  bets.forEach(bet => {
    if (bet.status === 'won') {
      totalStaked += bet.stake;
      totalReturned += calculatePayout(bet.stake, bet.odds);
    } else if (bet.status === 'lost') {
      totalStaked += bet.stake;
      // Lost bets return nothing
    } else if (bet.status === 'push') {
      totalStaked += bet.stake;
      totalReturned += bet.stake; // Push returns stake
    } else if (bet.status === 'pending') {
      pendingStake += bet.stake;
      pendingPotentialPayout += calculatePayout(bet.stake, bet.odds);
    }
  });

  const profit = totalReturned - totalStaked;
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
  const winRate = completedBets.length > 0 
    ? (wonBets.length / completedBets.length) * 100 
    : 0;

  return {
    totalBets: bets.length,
    wonBets: wonBets.length,
    lostBets: lostBets.length,
    pushBets: pushBets.length,
    pendingBets: pendingBets.length,
    completedBets: completedBets.length,
    totalStaked,
    totalReturned,
    profit,
    roi,
    winRate,
    pendingStake,
    pendingPotentialPayout,
    pendingPotentialProfit: pendingPotentialPayout - pendingStake
  };
}