// src/lib/conferences.ts

export interface ConferenceData {
  [sportKey: string]: {
    [teamName: string]: string;
  };
}

export const CONFERENCES: ConferenceData = {
  americanfootball_ncaaf: {
    // SEC
    "Alabama Crimson Tide": "SEC",
    "Arkansas Razorbacks": "SEC",
    "Auburn Tigers": "SEC",
    "Florida Gators": "SEC",
    "Georgia Bulldogs": "SEC",
    "Kentucky Wildcats": "SEC",
    "LSU Tigers": "SEC",
    "Mississippi State Bulldogs": "SEC",
    "Missouri Tigers": "SEC",
    "Ole Miss Rebels": "SEC",
    "South Carolina Gamecocks": "SEC",
    "Tennessee Volunteers": "SEC",
    "Texas A&M Aggies": "SEC",
    "Vanderbilt Commodores": "SEC",
     "Oklahoma Sooners": "SEC",
      "Texas Longhorns": "SEC",
    
    // Big Ten
    "Illinois Fighting Illini": "Big Ten",
    "Indiana Hoosiers": "Big Ten",
    "Iowa Hawkeyes": "Big Ten",
    "Maryland Terrapins": "Big Ten",
    "Michigan Wolverines": "Big Ten",
    "Michigan State Spartans": "Big Ten",
    "Minnesota Golden Gophers": "Big Ten",
    "Nebraska Cornhuskers": "Big Ten",
    "Northwestern Wildcats": "Big Ten",
    "Ohio State Buckeyes": "Big Ten",
    "Penn State Nittany Lions": "Big Ten",
    "Purdue Boilermakers": "Big Ten",
    "Rutgers Scarlet Knights": "Big Ten",
    "Wisconsin Badgers": "Big Ten",
    "Oregon Ducks": "Big Ten",
    "Washington Huskies": "Big Ten",
    
    // Big 12
    "Baylor Bears": "Big 12",
    "Cincinnati Bearcats": "Big 12",
    "Houston Cougars": "Big 12",
    "Iowa State Cyclones": "Big 12",
    "Kansas Jayhawks": "Big 12",
    "Kansas State Wildcats": "Big 12",
    "Oklahoma State Cowboys": "Big 12",
    "TCU Horned Frogs": "Big 12",
    "Texas Tech Red Raiders": "Big 12",
    "UCF Knights": "Big 12",
    "West Virginia Mountaineers": "Big 12",
    "BYU Cougars": "Big 12",
    "Colorado Buffaloes": "Big 12",
    "Arizona Wildcats": "Big 12",
    "Arizona State Sun Devils": "Big 12",
    "Utah Utes": "Big 12",
    
    // ACC
    "Boston College Eagles": "ACC",
    "Clemson Tigers": "ACC",
    "Duke Blue Devils": "ACC",
    "Florida State Seminoles": "ACC",
    "Georgia Tech Yellow Jackets": "ACC",
    "Louisville Cardinals": "ACC",
    "Miami Hurricanes": "ACC",
    "NC State Wolfpack": "ACC",
    "North Carolina Tar Heels": "ACC",
    "Pittsburgh Panthers": "ACC",
    "Syracuse Orange": "ACC",
    "Virginia Cavaliers": "ACC",
    "Virginia Tech Hokies": "ACC",
    "Wake Forest Demon Deacons": "ACC",
    "SMU Mustangs": "ACC",
    "California Golden Bears": "ACC",
    "Stanford Cardinal": "ACC",
    
    // Pac-12 (legacy/remaining)
    "Oregon State Beavers": "Pac-12",
    "Washington State Cougars": "Pac-12",
    
    // Independent
    "Notre Dame Fighting Irish": "Independent",
    "UConn Huskies": "Independent",
    "UMass Minutemen": "Independent",
    
    // Mountain West
    "Air Force Falcons": "Mountain West",
    "Boise State Broncos": "Mountain West",
    "Colorado State Rams": "Mountain West",
    "Fresno State Bulldogs": "Mountain West",
    "Hawaii Rainbow Warriors": "Mountain West",
    "Nevada Wolf Pack": "Mountain West",
    "New Mexico Lobos": "Mountain West",
    "San Diego State Aztecs": "Mountain West",
    "San Jose State Spartans": "Mountain West",
    "UNLV Rebels": "Mountain West",
    "Utah State Aggies": "Mountain West",
    "Wyoming Cowboys": "Mountain West",
    
    // American
    "Army Black Knights": "American",
    "Charlotte 49ers": "American",
    "East Carolina Pirates": "American",
    "FAU Owls": "American",
    "Memphis Tigers": "American",
    "Navy Midshipmen": "American",
    "Rice Owls": "American",
    "South Florida Bulls": "American",
    "Temple Owls": "American",
    "Tulane Green Wave": "American",
    "Tulsa Golden Hurricane": "American",
    "UAB Blazers": "American",
    "UTSA Roadrunners": "American",
    "North Texas Mean Green": "American",
    
    // Sun Belt
    "Appalachian State Mountaineers": "Sun Belt",
    "Arkansas State Red Wolves": "Sun Belt",
    "Coastal Carolina Chanticleers": "Sun Belt",
    "Georgia Southern Eagles": "Sun Belt",
    "Georgia State Panthers": "Sun Belt",
    "James Madison Dukes": "Sun Belt",
    "Louisiana Ragin' Cajuns": "Sun Belt",
    "Marshall Thundering Herd": "Sun Belt",
    "Old Dominion Monarchs": "Sun Belt",
    "South Alabama Jaguars": "Sun Belt",
    "Southern Miss Golden Eagles": "Sun Belt",
    "Texas State Bobcats": "Sun Belt",
    "Troy Trojans": "Sun Belt",
    "UL Monroe Warhawks": "Sun Belt",
    
    // Conference USA
    "FIU Panthers": "Conference USA",
    "Jacksonville State Gamecocks": "Conference USA",
    "Liberty Flames": "Conference USA",
    "Louisiana Tech Bulldogs": "Conference USA",
    "Middle Tennessee Blue Raiders": "Conference USA",
    "New Mexico State Aggies": "Conference USA",
    "Sam Houston Bearkats": "Conference USA",
    "UTEP Miners": "Conference USA",
    "Western Kentucky Hilltoppers": "Conference USA",
    "Delaware Blue Hens": "Conference USA",
    "Kennesaw State Owls": "Conference USA",
    "Missouri State Bears": "Conference USA",
    
    // MAC
    "Akron Zips": "MAC",
    "Ball State Cardinals": "MAC",
    "Bowling Green Falcons": "MAC",
    "Buffalo Bulls": "MAC",
    "Central Michigan Chippewas": "MAC",
    "Eastern Michigan Eagles": "MAC",
    "Kent State Golden Flashes": "MAC",
    "Miami (OH) RedHawks": "MAC",
    "Northern Illinois Huskies": "MAC",
    "Ohio Bobcats": "MAC",
    "Toledo Rockets": "MAC",
    "Western Michigan Broncos": "MAC",
    "UMass Minutemen": "MAC",
  },
  
  // You can add other sports here in the future
  basketball_ncaab: {
    // Add college basketball conferences here
  }
};

// Helper function to get unique conferences for a sport
export function getConferencesForSport(sportKey: string): string[] {
  const sportConferences = CONFERENCES[sportKey];
  if (!sportConferences) return [];
  
  const uniqueConferences = new Set(Object.values(sportConferences));
  return Array.from(uniqueConferences).sort();
}

// Helper function to get conference for a team
export function getTeamConference(sportKey: string, teamName: string): string | null {
  return CONFERENCES[sportKey]?.[teamName] || null;
}