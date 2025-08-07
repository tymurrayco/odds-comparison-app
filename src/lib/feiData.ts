// src/lib/feiData.ts

// Define the FEI team data structure
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
}

// Team name mapping to handle variations between your odds data and FEI data
export const FEI_TEAM_MAPPING: { [key: string]: string } = {
  // Map common variations (expand this based on actual mismatches)
  'Ohio State Buckeyes': 'Ohio State',
  'Georgia Bulldogs': 'Georgia',
  'Oregon Ducks': 'Oregon',
  'Notre Dame Fighting Irish': 'Notre Dame',
  'Alabama Crimson Tide': 'Alabama',
  'Texas Longhorns': 'Texas',
  'Penn State Nittany Lions': 'Penn State',
  'Ole Miss Rebels': 'Ole Miss',
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
  'Texas Longhorns': 'Texas',
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
  'Texas A&M Aggies': 'Texas A&M',
  'USC Trojans': 'USC',
  'Indiana Hoosiers': 'Indiana',
  'Oklahoma Sooners': 'Oklahoma',
  'Kansas State Wildcats': 'Kansas State',
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
  'Arizona State Sun Devils': 'Arizona State',
  'Boise State Broncos': 'Boise State',
  'Wisconsin Badgers': 'Wisconsin',
  'Missouri Tigers': 'Missouri',
  'Baylor Bears': 'Baylor',
  'Washington Huskies': 'Washington',
  'TCU Horned Frogs': 'TCU',
  'Utah Utes': 'Utah',
  'Auburn Tigers': 'Auburn',
  'Nebraska Cornhuskers': 'Nebraska',
  'Kentucky Wildcats': 'Kentucky',
  'Illinois Fighting Illini': 'Illinois',
  'Army Black Knights': 'Army',
  'Virginia Tech Hokies': 'Virginia Tech',
  'Texas Tech Red Raiders': 'Texas Tech',
  'Arkansas Razorbacks': 'Arkansas',
  'Tulane Green Wave': 'Tulane',
  'Cincinnati Bearcats': 'Cincinnati',
  'UCF Knights': 'UCF',
  'Kansas Jayhawks': 'Kansas',
  'UCLA Bruins': 'UCLA',
  'Colorado State Rams': 'Colorado State',
  'Colorado Buffaloes': 'Colorado',
  'Navy Midshipmen': 'Navy',
  'Rutgers Scarlet Knights': 'Rutgers',
  'Georgia Tech Yellow Jackets': 'Georgia Tech',
  'Syracuse Orange': 'Syracuse',
  'Maryland Terrapins': 'Maryland',
  'North Carolina Tar Heels': 'North Carolina',
  'California Golden Bears': 'California',
  'Cal Golden Bears': 'California',
  'Memphis Tigers': 'Memphis',
  'James Madison Dukes': 'James Madison',
  'Pittsburgh Panthers': 'Pittsburgh',
  'Pitt Panthers': 'Pittsburgh',
  'Oklahoma State Cowboys': 'Oklahoma State',
  'West Virginia Mountaineers': 'West Virginia',
  'Boston College Eagles': 'Boston College',
  'Washington State Cougars': 'Washington State',
  'NC State Wolfpack': 'NC State',
  'North Carolina State Wolfpack': 'NC State',
  'Vanderbilt Commodores': 'Vanderbilt',
  'Mississippi State Bulldogs': 'Mississippi State',
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
  'Michigan State Spartans': 'Michigan State',
  'Virginia Cavaliers': 'Virginia',
  'Oregon State Beavers': 'Oregon State',
  'Miami (OH) RedHawks': 'Miami (OH)',
  'Miami OH': 'Miami (OH)',
  'Texas State Bobcats': 'Texas State',
  'Fresno State Bulldogs': 'Fresno State',
  'Northwestern Wildcats': 'Northwestern',
  'Toledo Rockets': 'Toledo',
  'South Alabama Jaguars': 'South Alabama',
  'Jacksonville State Gamecocks': 'Jacksonville State',
  'Arizona Wildcats': 'Arizona',
  'Stanford Cardinal': 'Stanford',
  'Western Kentucky Hilltoppers': 'Western Kentucky',
  'WKU Hilltoppers': 'Western Kentucky',
  'UTSA Roadrunners': 'UTSA',
  'Air Force Falcons': 'Air Force',
  'San Jose State Spartans': 'San Jose State',
  'Liberty Flames': 'Liberty',
  // Additional Group of 5 teams with mascots
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
 * Fetches and parses FEI data from the BCF Toys website
 * Note: This function needs to be called from a server-side API route
 * to avoid CORS issues
 */
export async function fetchFEIData(): Promise<FEITeamData[]> {
  // Check cache first
  if (feiDataCache && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
    return feiDataCache;
  }

  try {
    // In production, this should be called through your API route to avoid CORS
    const response = await fetch('/api/fei-data');
    
    if (!response.ok) {
      throw new Error('Failed to fetch FEI data');
    }
    
    const data = await response.json();
    
    // Cache the data
    feiDataCache = data;
    lastFetchTime = Date.now();
    
    return data;
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