// src/lib/feiData.ts

// Import possession data type from API route
export interface PossessionData {
  ove: number;     // Offensive Value per possession
  oveRank: number;
  dve: number;     // Defensive Value per possession  
  dveRank: number;
  sve: number;     // Special teams value per possession
  sveRank: number;
  ovg: number;     // Offensive Value per Game
  dvg: number;     // Defensive Value per Game
  svg: number;     // Special teams value per game
  npg: number;     // Non-garbage Possessions per Game
}

// Enhanced FEI team data structure with possession data
export interface FEITeamData {
  rank: number;
  team: string;
  record?: string;  // Will be empty initially in preseason
  fbs?: string;     // FBS record
  fei: number;      // Overall efficiency rating
  ofei: number;     // Offensive efficiency rating
  ofeiRank: number;
  dfei: number;     // Defensive efficiency rating
  dfeiRank: number;
  sfei: number;     // Special teams efficiency rating
  sfeiRank: number;
  // Strength of Schedule metrics
  els: number;      // Elite SOS
  elsRank: number;
  gls: number;      // Good SOS
  glsRank: number;
  als: number;      // Average SOS
  alsRank: number;
  // Strength of Record metrics
  ewd: number;      // Elite win differential
  ewdRank: number;
  gwd: number;      // Good win differential
  gwdRank: number;
  awd: number;      // Average win differential
  awdRank: number;
  // Possession efficiency data
  possession?: PossessionData;
}

// Score projection result type
export interface ScoreProjection {
  away: {
    expected: number;
    low: number;
    high: number;
  };
  home: {
    expected: number;
    low: number;
    high: number;
  };
  total: {
    expected: number;
    low: number;
    high: number;
  };
  spread: number;
  possessions: number;
  confidence: string;
}

// Team name mapping to handle variations between your odds data and FEI data
export const FEI_TEAM_MAPPING: { [key: string]: string } = {
  // Map common variations (expand this based on actual mismatches)
  'Ohio State Buckeyes': 'Ohio State',
  'Georgia Bulldogs': 'Georgia',
  'Notre Dame Fighting Irish': 'Notre Dame',
  'Alabama Crimson Tide': 'Alabama',
  'Texas Longhorns': 'Texas',
  'Penn State Nittany Lions': 'Penn State',
  'Michigan State Spartans': 'Michigan State',
  'Michigan Wolverines': 'Michigan',
  'Mississippi State Bulldogs': 'Mississippi State',
  'Ole Miss Rebels': 'Ole Miss',
  'North Carolina State Wolfpack': 'NC State',
  'NC State Wolfpack': 'NC State',
  'North Carolina Tar Heels': 'North Carolina',
  'Oklahoma State Cowboys': 'Oklahoma State',
  'Oklahoma Sooners': 'Oklahoma',
  'Oregon State Beavers': 'Oregon State',
  'Oregon Ducks': 'Oregon',
  'Texas State Bobcats': 'Texas State',
  'Texas Tech Red Raiders': 'Texas Tech',
  'Texas A&M Aggies': 'Texas A&M',
  'Virginia Tech Hokies': 'Virginia Tech',
  'Virginia Cavaliers': 'Virginia',
  'Washington State Cougars': 'Washington State',
  'Washington Huskies': 'Washington',
  'Kansas State Wildcats': 'Kansas State',
  'Kansas Jayhawks': 'Kansas',
  'Arizona State Sun Devils': 'Arizona State',
  'Arizona Wildcats': 'Arizona',
  'Tennessee Volunteers': 'Tennessee',
  'LSU Tigers': 'LSU',
  'Clemson Tigers': 'Clemson',
  'USC Trojans': 'USC',
  'Indiana Hoosiers': 'Indiana',
  'Louisville Cardinals': 'Louisville',
  'Iowa Hawkeyes': 'Iowa',
  'Florida Gators': 'Florida',
  'Minnesota Golden Gophers': 'Minnesota',
  'Iowa State Cyclones': 'Iowa State',
  'Miami Hurricanes': 'Miami',
  'Miami (FL) Hurricanes': 'Miami',
  'Miami FL': 'Miami',
  'South Carolina Gamecocks': 'South Carolina',
  'BYU Cougars': 'BYU',
  'SMU Mustangs': 'SMU',
  'Boise State Broncos': 'Boise State',
  'Wisconsin Badgers': 'Wisconsin',
  'Missouri Tigers': 'Missouri',
  'Baylor Bears': 'Baylor',
  'TCU Horned Frogs': 'TCU',
  'Utah Utes': 'Utah',
  'Auburn Tigers': 'Auburn',
  'Nebraska Cornhuskers': 'Nebraska',
  'Kentucky Wildcats': 'Kentucky',
  'Illinois Fighting Illini': 'Illinois',
  'Army Black Knights': 'Army',
  'Arkansas Razorbacks': 'Arkansas',
  'Tulane Green Wave': 'Tulane',
  'Cincinnati Bearcats': 'Cincinnati',
  'UCF Knights': 'UCF',
  'UCLA Bruins': 'UCLA',
  'Colorado State Rams': 'Colorado State',
  'Colorado Buffaloes': 'Colorado',
  'Navy Midshipmen': 'Navy',
  'Rutgers Scarlet Knights': 'Rutgers',
  'Georgia Tech Yellow Jackets': 'Georgia Tech',
  'Syracuse Orange': 'Syracuse',
  'Maryland Terrapins': 'Maryland',
  'California Golden Bears': 'California',
  'Cal Golden Bears': 'California',
  'Memphis Tigers': 'Memphis',
  'James Madison Dukes': 'James Madison',
  'Pittsburgh Panthers': 'Pittsburgh',
  'Pitt Panthers': 'Pittsburgh',
  'West Virginia Mountaineers': 'West Virginia',
  'Boston College Eagles': 'Boston College',
  'Vanderbilt Commodores': 'Vanderbilt',
  'Duke Blue Devils': 'Duke',
  'UNLV Rebels': 'UNLV',
  'Florida State Seminoles': 'Florida State',
  'Marshall Thundering Herd': 'Marshall',
  'Houston Cougars': 'Houston',
  'Wake Forest Demon Deacons': 'Wake Forest',
  'Sam Houston State Bearkats': 'Sam Houston',
  'Sam Houston Bearkats': 'Sam Houston',
  'Hawaii Rainbow Warriors': 'Hawaii',
  'South Florida Bulls': 'South Florida',
  'USF Bulls': 'South Florida',
  'Akron Zips': 'Akron',
  'East Carolina Pirates': 'East Carolina',
  'ECU Pirates': 'East Carolina',
  'Buffalo Bulls': 'Buffalo',
  'Charlotte 49ers': 'Charlotte',
  'Kennesaw State Owls': 'Kennesaw State',
  'Central Michigan Chippewas': 'Central Michigan',
  'Florida Atlantic Owls': 'Florida Atlantic',
  'FAU Owls': 'Florida Atlantic',
  'Southern Mississippi Golden Eagles': 'Southern Mississippi',
  'Southern Miss Golden Eagles': 'Southern Mississippi',
  'Old Dominion Monarchs': 'Old Dominion',
  'Nevada Wolf Pack': 'Nevada',
  'Coastal Carolina Chanticleers': 'Coastal Carolina',
  'New Mexico Lobos': 'New Mexico',
  'UTEP Miners': 'UTEP',
  'Rice Owls': 'Rice',
  'Louisiana Ragin\' Cajuns': 'Louisiana',
  'UL Lafayette': 'Louisiana',
  'Louisiana Lafayette': 'Louisiana',
  'ULL': 'Louisiana',
  'Ohio Bobcats': 'Ohio',
  'Miami (OH) RedHawks': 'Miami (OH)',
  'Miami OH': 'Miami (OH)',
  'Fresno State Bulldogs': 'Fresno State',
  'Northwestern Wildcats': 'Northwestern',
  'Toledo Rockets': 'Toledo',
  'South Alabama Jaguars': 'South Alabama',
  'Jacksonville State Gamecocks': 'Jacksonville State',
  'Stanford Cardinal': 'Stanford',
  'Western Kentucky Hilltoppers': 'Western Kentucky',
  'WKU Hilltoppers': 'Western Kentucky',
  'UTSA Roadrunners': 'UTSA',
  'Air Force Falcons': 'Air Force',
  'San Jose State Spartans': 'San Jose State',
  'Liberty Flames': 'Liberty',
  'Ball State Cardinals': 'Ball State',
  'Bowling Green Falcons': 'Bowling Green',
  'BGSU Falcons': 'Bowling Green',
  'Kent State Golden Flashes': 'Kent State',
  'Northern Illinois Huskies': 'Northern Illinois',
  'NIU Huskies': 'Northern Illinois',
  'Eastern Michigan Eagles': 'Eastern Michigan',
  'Western Michigan Broncos': 'Western Michigan',
  'Appalachian State Mountaineers': 'Appalachian State',
  'App State Mountaineers': 'Appalachian State',
  'Arkansas State Red Wolves': 'Arkansas State',
  'Georgia Southern Eagles': 'Georgia Southern',
  'Georgia State Panthers': 'Georgia State',
  'Troy Trojans': 'Troy',
  'UL Monroe Warhawks': 'UL Monroe',
  'Louisiana Monroe Warhawks': 'UL Monroe',
  'Middle Tennessee Blue Raiders': 'Middle Tennessee',
  'MTSU Blue Raiders': 'Middle Tennessee',
  'UAB Blazers': 'UAB',
  'North Texas Mean Green': 'North Texas',
  'UNT Mean Green': 'North Texas',
  'Temple Owls': 'Temple',
  'Tulsa Golden Hurricane': 'Tulsa',
  'San Diego State Aztecs': 'San Diego State',
  'SDSU Aztecs': 'San Diego State',
  'Wyoming Cowboys': 'Wyoming',
  'Utah State Aggies': 'Utah State',
  'Delaware Blue Hens': 'Delaware',
  'Missouri State Bears': 'Missouri State',
  'New Mexico State Aggies': 'New Mexico State',
  'NMSU Aggies': 'New Mexico State',
  'Massachusetts Minutemen': 'Massachusetts',
  'UMass Minutemen': 'Massachusetts',
};

// Cache for storing fetched data
let feiDataCache: FEITeamData[] | null = null;
let lastFetchTime: number | null = null;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

/**
 * Fetches and parses FEI data from the BCF Toys website with possession data
 * Note: This function needs to be called from a server-side API route
 * to avoid CORS issues
 */
export async function fetchFEIData(): Promise<FEITeamData[]> {
  // Check cache first
  if (feiDataCache && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
    return feiDataCache;
  }

  try {
    // Fetch both FEI and possession data in parallel
    const [feiResponse, possessionResponse] = await Promise.all([
      fetch('/api/fei-data'),
      fetch('/api/possession-data')
    ]);
    
    if (!feiResponse.ok) {
      throw new Error('Failed to fetch FEI data');
    }
    
    const feiData: FEITeamData[] = await feiResponse.json();
    let possessionData: any[] = [];
    
    if (possessionResponse.ok) {
      possessionData = await possessionResponse.json();
    } else {
      console.warn('Could not fetch possession data, continuing without it');
    }
    
    // Create a map of possession data by team name
    const possessionMap = new Map<string, PossessionData>();
    possessionData.forEach(team => {
      possessionMap.set(team.team, team);
    });
    
    // Merge possession data into FEI data
    const enhancedData = feiData.map(team => {
      let possession = possessionMap.get(team.team);
      
      // Try alternate team names if not found
      if (!possession) {
        // Handle team name variations
        const alternateNames: Record<string, string[]> = {
          'Miami': ['Miami (FL)', 'Miami'],
          'Miami (OH)': ['Miami (OH)', 'Miami-OH'],
          'USC': ['USC', 'Southern Cal'],
          'UAB': ['UAB', 'Alabama-Birmingham'],
          'UTEP': ['UTEP', 'Texas-El Paso'],
          'UTSA': ['UTSA', 'Texas-San Antonio'],
          'UL Monroe': ['UL Monroe', 'Louisiana-Monroe'],
          'Louisiana': ['Louisiana', 'Louisiana-Lafayette', 'ULL'],
        };
        
        const alts = alternateNames[team.team];
        if (alts) {
          for (const alt of alts) {
            possession = possessionMap.get(alt);
            if (possession) break;
          }
        }
      }
      
      return {
        ...team,
        possession
      };
    });
    
    // Log any teams missing possession data for debugging
    const missingPossession = enhancedData.filter(t => !t.possession);
    if (missingPossession.length > 0) {
      console.log('Teams missing possession data:', missingPossession.map(t => t.team).join(', '));
    }
    
    // Cache the data
    feiDataCache = enhancedData;
    lastFetchTime = Date.now();
    
    return enhancedData;
  } catch (error) {
    console.error('Error fetching FEI data:', error);
    // Return cached data if available, even if expired
    if (feiDataCache) {
      return feiDataCache;
    }
    throw error;
  }
}

/**
 * Calculate expected score using both FEI and possession data
 */
export function calculateExpectedScore(
  away: FEITeamData,
  home: FEITeamData
): ScoreProjection {
  // Fallback if no possession data
  if (!away.possession || !home.possession) {
    return calculateBasicFEIScore(away, home);
  }
  
  const awayPoss = away.possession;
  const homePoss = home.possession;
  
  // Method 1: Direct scoring value approach (using actual game values)
  const directMethod = {
    away: 28 + (awayPoss.ovg - homePoss.dvg) / 2,
    home: 30 + (homePoss.ovg - awayPoss.dvg) / 2
  };
  
  // Method 2: Possession-based with FEI adjustments
  const avgPossessions = (awayPoss.npg + homePoss.npg) / 2;
  const possessionMethod = {
    // Combine unadjusted possession efficiency with opponent-adjusted FEI
    away: (awayPoss.ove * avgPossessions / 2) + (away.ofei * 5) - (home.dfei * 3),
    home: (homePoss.ove * avgPossessions / 2) + (home.ofei * 5) - (away.dfei * 3) + 2.5
  };
  
  // Method 3: Hybrid approach weighing both
  const hybrid = {
    away: (directMethod.away * 0.4) + (possessionMethod.away * 0.6),
    home: (directMethod.home * 0.4) + (possessionMethod.home * 0.6)
  };
  
  // Add pace adjustment
  const paceMultiplier = avgPossessions / 21; // 21 is roughly average
  
  const finalScores = {
    away: Math.round(hybrid.away * (paceMultiplier * 0.2 + 0.8)), // Mild pace adjustment
    home: Math.round(hybrid.home * (paceMultiplier * 0.2 + 0.8))
  };
  
  // Calculate confidence
  const confidence = getProjectionConfidence(away, home, awayPoss, homePoss);
  
  return {
    away: {
      expected: finalScores.away,
      low: Math.max(0, finalScores.away - 4),
      high: finalScores.away + 4
    },
    home: {
      expected: finalScores.home,
      low: Math.max(0, finalScores.home - 4),
      high: finalScores.home + 4
    },
    total: {
      expected: finalScores.away + finalScores.home,
      low: finalScores.away + finalScores.home - 7,
      high: finalScores.away + finalScores.home + 7
    },
    spread: finalScores.home - finalScores.away,
    possessions: Math.round(avgPossessions),
    confidence
  };
}

// Fallback for teams without possession data
function calculateBasicFEIScore(away: FEITeamData, home: FEITeamData): ScoreProjection {
  const awayScore = 28 + (away.ofei * 10) - (home.dfei * 5);
  const homeScore = 30 + (home.ofei * 10) - (away.dfei * 5);
  
  return {
    away: {
      expected: Math.round(awayScore),
      low: Math.max(0, Math.round(awayScore - 4)),
      high: Math.round(awayScore + 4)
    },
    home: {
      expected: Math.round(homeScore),
      low: Math.max(0, Math.round(homeScore - 4)),
      high: Math.round(homeScore + 4)
    },
    total: {
      expected: Math.round(awayScore + homeScore),
      low: Math.round(awayScore + homeScore - 7),
      high: Math.round(awayScore + homeScore + 7)
    },
    spread: Math.round(homeScore - awayScore),
    possessions: 21, // Default average
    confidence: 'Moderate (No Possession Data)'
  };
}

function getProjectionConfidence(
  away: FEITeamData,
  home: FEITeamData,
  awayPoss: PossessionData,
  homePoss: PossessionData
): string {
  const feiDiff = Math.abs(away.fei - home.fei);
  const possessionConsistency = Math.abs(awayPoss.npg - homePoss.npg) < 3;
  const clearMismatch = Math.abs(away.ofei - home.dfei) > 0.5 || 
                        Math.abs(home.ofei - away.dfei) > 0.5;
  
  if (feiDiff > 0.7 && clearMismatch) return 'Very High';
  if (feiDiff > 0.4 || (possessionConsistency && clearMismatch)) return 'High';
  if (feiDiff > 0.2) return 'Moderate';
  return 'Low';
}

/**
 * Gets FEI data for a specific team
 */
export function getTeamFEIData(teamName: string, feiData: FEITeamData[]): FEITeamData | null {
  // First try exact match
  let team = feiData.find(t => t.team.toLowerCase() === teamName.toLowerCase());
  
  // If not found, try mapped name
  if (!team) {
    const mappedName = FEI_TEAM_MAPPING[teamName];
    if (mappedName) {
      team = feiData.find(t => t.team.toLowerCase() === mappedName.toLowerCase());
    }
  }
  
  // If still not found, try removing common suffixes and matching again
  if (!team) {
    // Remove common team name suffixes for matching
    const simplifiedName = teamName
      .replace(/ (Rams|Buffaloes|Tigers|Bulldogs|Wildcats|Cowboys|Aggies|Rebels|Trojans|Hoosiers|Sooners|Cardinals|Hawkeyes|Gators|Golden Gophers|Cyclones|Hurricanes|Gamecocks|Cougars|Mustangs|Sun Devils|Broncos|Badgers|Bears|Huskies|Horned Frogs|Utes|Cornhuskers|Fighting Illini|Black Knights|Hokies|Red Raiders|Razorbacks|Green Wave|Bearcats|Knights|Jayhawks|Bruins|Midshipmen|Scarlet Knights|Yellow Jackets|Orange|Terrapins|Tar Heels|Golden Bears|Dukes|Panthers|Mountaineers|Eagles|Wolfpack|Commodores|Blue Devils|Seminoles|Thundering Herd|Demon Deacons|Ragin' Cajuns|Bobcats|Spartans|Cavaliers|Beavers|RedHawks|Hilltoppers|Roadrunners|Falcons|Jaguars|Cardinal|Flames)$/i, '')
      .trim();
    
    // Try exact match with simplified name
    team = feiData.find(t => t.team.toLowerCase() === simplifiedName.toLowerCase());
  }
  
  // Last resort: careful partial match (but avoid false positives like Colorado/Colorado State)
  if (!team) {
    // Check if the team name ends with the FEI team name (e.g., "Colorado State Rams" ends with "State")
    // This is too risky, so we'll skip partial matching for now
    // Instead, log a warning
    console.warn(`Could not find FEI data for team: ${teamName}`);
  }
  
  return team || null;
}

/**
 * Compares two teams' FEI data
 */
export function compareTeams(team1: FEITeamData, team2: FEITeamData) {
  return {
    overallAdvantage: team1.fei > team2.fei ? team1.team : team2.team,
    offensiveAdvantage: team1.ofei > team2.ofei ? team1.team : team2.team,
    defensiveAdvantage: team1.dfei > team2.dfei ? team1.team : team2.team,
    specialTeamsAdvantage: team1.sfei > team2.sfei ? team1.team : team2.team,
    feiDifference: Math.abs(team1.fei - team2.fei),
    ofeiDifference: Math.abs(team1.ofei - team2.ofei),
    dfeiDifference: Math.abs(team1.dfei - team2.dfei),
    sfeiDifference: Math.abs(team1.sfei - team2.sfei),
  };
}

/**
 * Formats FEI value for display (adds + for positive values)
 */
export function formatFEIValue(value: number): string {
  if (value > 0) return `+${value.toFixed(2)}`;
  return value.toFixed(2);
}

/**
 * Converts team name to logo filename format
 * Example: "Ohio State" -> "ohiostatebuckeyes"
 * This should match your logo filenames in /team-logos/
 */
export function getTeamLogoName(teamName: string): string {
  // Special cases for team name to logo mapping
  const logoMapping: { [key: string]: string } = {
    'Ohio State': 'ohiostatebuckeyes',
    'Georgia': 'georgiabulldogs',
    'Oregon': 'oregonducks',
    'Notre Dame': 'notredamefightingirish',
    'Alabama': 'alabamacrimsontide',
    'Texas': 'texaslonghorns',
    'Penn State': 'pennstatenittanylions',
    'Ole Miss': 'olemissrebels',
    'Michigan': 'michiganwolverines',
    'Tennessee': 'tennesseevolunteers',
    'LSU': 'lsutigers',
    'Clemson': 'clemsontigers',
    'Texas A&M': 'texasamaggies',
    'USC': 'usctrojans',
    'Indiana': 'indianahoosiers',
    'Oklahoma': 'oklahomasooners',
    'Kansas State': 'kansasstatewildcats',
    'Louisville': 'louisvillecardinals',
    'Iowa': 'iowahawkeyes',
    'Florida': 'floridagators',
    'Minnesota': 'minnesotagoldengophers',
    'Iowa State': 'iowastatecyclones',
    'Miami': 'miamihurricanes',
    'South Carolina': 'southcarolinagamecocks',
    'BYU': 'byucougars',
    'SMU': 'smumustangs',
    'Arizona State': 'arizonastatesundevils',
    'Boise State': 'boisestatebroncos',
    'Wisconsin': 'wisconsinbadgers',
    'Missouri': 'missouritigers',
    'Baylor': 'baylorbears',
    'Washington': 'washingtonhuskies',
    'TCU': 'tcuhornedfrogs',
    'Utah': 'utahutes',
    'Auburn': 'auburntigers',
    'Nebraska': 'nebraskacornhuskers',
    'Kentucky': 'kentuckywildcats',
    'Illinois': 'illinoisfightingillini',
    'Army': 'armyblackknights',
    'Virginia Tech': 'virginiatechhokies',
    'Texas Tech': 'texastechredraiders',
    'Arkansas': 'arkansasrazorbacks',
    'Tulane': 'tulanegreenwaves',
    'Cincinnati': 'cincinnatibearcats',
    'UCF': 'ucfknights',
    'Kansas': 'kansasjayhawks',
    'UCLA': 'uclabruins',
    'Colorado State': 'coloradostaterams',
    'Colorado': 'coloradobuffaloes',
    'Navy': 'navymidshipmen',
    'Rutgers': 'rutgersscarletknights',
    'Georgia Tech': 'georgiatechyellowjackets',
    'Syracuse': 'syracuseorange',
    'Maryland': 'marylandterrapins',
    'North Carolina': 'northcarolinatarheels',
    'California': 'californiagoldenbears',
    'Memphis': 'memphistigers',
    'James Madison': 'jamesmadisondukes',
    'Pittsburgh': 'pittsburghpanthers',
    'Oklahoma State': 'oklahomastatecowboys',
    'West Virginia': 'westvirginiamountaineers',
    'Boston College': 'bostoncollegeeagles',
    'Washington State': 'washingtonstatecougars',
    'NC State': 'ncstatewolfpack',
    'Vanderbilt': 'vanderbiltcommodores',
    'Mississippi State': 'mississippistatebulldogs',
    'Duke': 'dukebluedevils',
    'UNLV': 'unlvrebels',
    'Florida State': 'floridastateseminoles',
    'Marshall': 'marshallthunderingherd',
    'Houston': 'houstoncougars',
    'Wake Forest': 'wakeforestdemondeacons',
    'Sam Houston': 'samhoustonbearkats',
    'Hawaii': 'hawaiirainbowwarriors',
    'South Florida': 'southfloridabulls',
    'Akron': 'akronzips',
    'East Carolina': 'eastcarolinapirates',
    'Buffalo': 'buffalobulls',
    'Charlotte': 'charlotte49ers',
    'Kennesaw State': 'kennesawstateowls',
    'Central Michigan': 'centralmichiganchippewas',
    'Florida Atlantic': 'floridaatlanticowls',
    'Southern Mississippi': 'southernmississippigoldeneagles',
    'Old Dominion': 'olddominionmonarchs',
    'Nevada': 'nevadawolfpack',
    'Coastal Carolina': 'coastalcarolinachanticleers',
    'New Mexico': 'newmexicolobos',
    'UTEP': 'utepminers',
    'Rice': 'riceowls',
    'Louisiana': 'louisianarajincajuns',
    'Ohio': 'ohiobobcats',
    'Michigan State': 'michiganstatespartans',
    'Virginia': 'virginiacavaliers',
    'Oregon State': 'oregonstatebeavers',
    'Miami (OH)': 'miamiohredhawks',
    'Texas State': 'texasstatebobcats',
    'Fresno State': 'fresnostatebulldogs',
    'Northwestern': 'northwesternwildcats',
    'Toledo': 'toledorockets',
    'South Alabama': 'southalabamajaguars',
    'Jacksonville State': 'jacksonvillestategamecocks',
    'Arizona': 'arizonawildcats',
    'Stanford': 'stanfordcardinal',
    'Western Kentucky': 'westernkentuckyhilltoppers',
    'UTSA': 'utsaroadrunners',
    'Air Force': 'airforcefalcons',
    'San Jose State': 'sanjosestatespartans',
    'Liberty': 'libertyflames',
    'Ball State': 'ballstatecardinals',
    'Bowling Green': 'bowlinggreenfalcons',
    'Kent State': 'kentstategoldenflashes',
    'Northern Illinois': 'northernillinoisthuskies',
    'Eastern Michigan': 'easternmichiganeagles',
    'Western Michigan': 'westernmichiganbroncos',
    'Appalachian State': 'appalachianstatemountaineers',
    'Arkansas State': 'arkansasstateredwolves',
    'Georgia Southern': 'georgiasoutherneagles',
    'Georgia State': 'georgiastatepanthers',
    'Troy': 'troytrojans',
    'UL Monroe': 'ulmonroewarhawks',
    'Middle Tennessee': 'middletennesseeblueraiders',
    'UAB': 'uabblazers',
    'North Texas': 'northtexasmeangreen',
    'Temple': 'templeowls',
    'Tulsa': 'tulsagoldenhurricane',
    'San Diego State': 'sandiegostateaztecs',
    'Wyoming': 'wyomingcowboys',
    'Utah State': 'utahstateaggies',
    'Delaware': 'delawarebluehens',
    'Missouri State': 'missouristatebears',
    'New Mexico State': 'newmexicostateaggies',
    'Massachusetts': 'massachusettsminutemen',
  };
  
  // Check if we have a specific mapping
  if (logoMapping[teamName]) {
    return logoMapping[teamName];
  }
  
  // Otherwise, convert to lowercase and remove spaces/special characters
  return teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
}