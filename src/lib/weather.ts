// src/lib/weather.ts
//
// Game-time weather for outdoor football and baseball, for the warning icons
// on game cards. Server-side only. For each upcoming game ESPN lists (venue
// city + an "indoor" flag), the city is geocoded and the hourly forecast read
// for the three and a half hours from kickoff. A game is flagged only when the
// weather is bad enough to matter — most games return no flags.
// The CFL is the exception: ESPN has no CFL schedule, so its games come from
// the odds board and its stadiums from a fixed list (CFL_VENUES).
//
// Sources, both read for every US game; a flag from either one counts:
//   - National Weather Service (api.weather.gov): the official US forecast —
//     chance of rain, sustained wind, and its wording. Public domain.
//   - Open-Meteo: gusts and amounts, venues abroad, and the geocoding. Its
//     free tier is for NON-COMMERCIAL use; a commercial odds.day needs their
//     paid plan or a replacement for those parts.
// Everything that talks to either is in this file.

import { getBoardGames } from '@/lib/server/boardOdds';

export type WeatherFlag ='storm' | 'snow' | 'rain' | 'wind';

export interface GameWeather {
  homeTeam: string; // ESPN display names, matched to the odds feed by the card
  awayTeam: string;
  kickoff: string;
  venue: string;
  city: string;
  flags: WeatherFlag[]; // empty = nothing worth showing
  tempF: number;
  windMph: number; // strongest sustained wind during the game
  gustMph: number;
  precipChance: number; // highest hourly chance, %
  precipIn: number; // total over the game window
  snowIn: number;
  summary?: string; // the NWS's own words for the wettest hour ("Showers And Thunderstorms")
  source: 'nws' | 'open-meteo'; // whose forecast leads (the NWS wherever it covers the venue)
}

// What counts as "bad enough to show"
// 15 mph sustained flagged a third of a breezy Saturday (many at exactly 15
// with weak gusts); 18 keeps the games where wind really affects kicks and throws
export const WIND_SUSTAINED_MPH = 18;
export const WIND_GUST_MPH = 35;
export const RAIN_CHANCE_PCT = 50;
export const RAIN_MIN_INCHES = 0.1;
export const SNOW_MIN_INCHES = 0.1;
// NWS wording: "likely" starts at 60%; storms and snow are flagged from 50%
export const NWS_RAIN_CHANCE_PCT = 60;
export const NWS_STORM_SNOW_CHANCE_PCT = 50;
const GAME_HOURS = 4; // kickoff hour + the next three

// ESPN's baseball scoreboard serves one day per request (date ranges come back
// empty), so MLB asks for yesterday through four days out, US Eastern dates.
const mlbDays = (): string[] =>
  [-1, 0, 1, 2, 3, 4].map((d) => {
    const day = new Date(Date.now() + d * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return `?dates=${day.replace(/-/g, '')}`;
  });

const ESPN_PATH: Record<string, { path: string; queries: () => string[] }> = {
  americanfootball_nfl: { path: 'football/nfl', queries: () => [''] },
  americanfootball_ncaaf: { path: 'football/college-football', queries: () => ['?limit=300&groups=80', '?limit=300&groups=81'] },
  baseball_mlb: { path: 'baseball/mlb', queries: mlbDays },
};

const CFL = 'americanfootball_cfl';

export const WEATHER_SPORTS = new Set([...Object.keys(ESPN_PATH), CFL]);

// CFL home stadiums, keyed by the odds feed's team name (letters only). BC
// Place has a roof, so the Lions have no entry. Neutral-site games (the Grey
// Cup) would read the listed home team's stadium.
const CFL_VENUES: Record<string, { venue: string; city: string; lat: number; lon: number }> = {
  calgarystampeders: { venue: 'McMahon Stadium', city: 'Calgary, AB', lat: 51.0704, lon: -114.1215 },
  edmontonelks: { venue: 'Commonwealth Stadium', city: 'Edmonton, AB', lat: 53.5597, lon: -113.4761 },
  saskatchewanroughriders: { venue: 'Mosaic Stadium', city: 'Regina, SK', lat: 50.4513, lon: -104.6336 },
  winnipegbluebombers: { venue: 'Princess Auto Stadium', city: 'Winnipeg, MB', lat: 49.8078, lon: -97.1432 },
  hamiltontigercats: { venue: 'Hamilton Stadium', city: 'Hamilton, ON', lat: 43.2523, lon: -79.83 },
  torontoargonauts: { venue: 'BMO Field', city: 'Toronto, ON', lat: 43.6332, lon: -79.4186 },
  ottawaredblacks: { venue: 'TD Place Stadium', city: 'Ottawa, ON', lat: 45.3981, lon: -75.6835 },
  montrealalouettes: { venue: 'Percival Molson Stadium', city: 'Montreal, QC', lat: 45.5101, lon: -73.5808 },
};

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// ESPN gives football states as "OH" and baseball states as "Ohio"
const STATE_ABBR = new Map(Object.entries(STATE_NAMES).map(([abbr, name]) => [name.toLowerCase(), abbr]));
const stateAbbr = (state: string): string => STATE_ABBR.get(state.trim().toLowerCase()) ?? state;

interface Venue {
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  venue: string;
  city: string;
  state: string; // US state abbreviation, or '' abroad
  lat?: number; // set when the stadium is already known (CFL) — no geocoding
  lon?: number;
}

interface EspnEvent {
  date?: string;
  competitions?: Array<{
    venue?: { fullName?: string; indoor?: boolean; address?: { city?: string; state?: string } };
    competitors?: Array<{ homeAway?: string; team?: { displayName?: string } }>;
    status?: { type?: { state?: string } };
  }>;
}

async function outdoorGames(sport: string): Promise<Venue[]> {
  const cfg = ESPN_PATH[sport];
  const pages = await Promise.all(
    cfg.queries().map(async (q) => {
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${cfg.path}/scoreboard${q}`, {
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? ((await res.json()) as { events?: EspnEvent[] }) : null;
    })
  );
  const out: Venue[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const ev of page?.events ?? []) {
      const c = ev.competitions?.[0];
      const home = c?.competitors?.find((x) => x.homeAway === 'home')?.team?.displayName;
      const away = c?.competitors?.find((x) => x.homeAway === 'away')?.team?.displayName;
      const city = c?.venue?.address?.city;
      if (!ev.date || !home || !away || !city) continue;
      if (c?.venue?.indoor) continue; // a roof: weather doesn't reach the field
      if (c?.status?.type?.state === 'post') continue;
      const key = `${away}@${home}@${ev.date}`; // the date keeps each game of a baseball series
      if (seen.has(key)) continue;
      seen.add(key);
      // ESPN names some college venues "Memorial Stadium (Lincoln, NE)"; the city is shown separately
      const venue = (c?.venue?.fullName ?? '').replace(/\s*\([^)]*\)\s*$/, '');
      out.push({ homeTeam: home, awayTeam: away, kickoff: ev.date, venue, city, state: stateAbbr(c?.venue?.address?.state ?? '') });
    }
  }
  return out;
}

// CFL: upcoming games from the odds board (the same cached Odds API call the
// board itself makes), each placed at its home team's stadium.
async function cflGames(): Promise<Venue[]> {
  const games = await getBoardGames(CFL);
  const now = Date.now();
  const out: Venue[] = [];
  for (const g of games) {
    const v = CFL_VENUES[g.home_team.replace(/[^a-zA-Z]/g, '').toLowerCase()];
    if (!v) continue; // BC Place, or a name the list doesn't know
    if (new Date(g.commence_time).getTime() < now - GAME_HOURS * 3_600_000) continue;
    out.push({ homeTeam: g.home_team, awayTeam: g.away_team, kickoff: g.commence_time, venue: v.venue, city: v.city, state: '', lat: v.lat, lon: v.lon });
  }
  return out;
}

interface GeoHit {
  latitude: number;
  longitude: number;
  admin1?: string;
  country_code?: string;
}

// City → coordinates. Venues don't move, so answers are kept for a month.
async function geocode(city: string, state: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=10&language=en&format=json`,
      { next: { revalidate: 60 * 60 * 24 * 30 }, signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) return null;
    const hits = ((await res.json()) as { results?: GeoHit[] }).results ?? [];
    const stateName = STATE_NAMES[state.toUpperCase()];
    const hit = stateName
      ? hits.find((h) => h.country_code === 'US' && h.admin1 === stateName) // right state, or nothing: a wrong city is worse than no icon
      : hits[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
  } catch {
    return null;
  }
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: (number | null)[];
  precipitation: number[];
  snowfall: number[];
  weather_code: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
}

async function forecasts(points: { lat: number; lon: number }[]): Promise<(Hourly | null)[]> {
  const out: (Hourly | null)[] = [];
  for (let i = 0; i < points.length; i += 40) {
    const chunk = points.slice(i, i + 40);
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${chunk.map((p) => p.lat.toFixed(3)).join(',')}&longitude=${chunk.map((p) => p.lon.toFixed(3)).join(',')}` +
      '&hourly=temperature_2m,precipitation_probability,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m' +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=UTC&forecast_days=10';
    try {
      const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as { hourly?: Hourly } | { hourly?: Hourly }[];
      const list = Array.isArray(json) ? json : [json];
      for (let j = 0; j < chunk.length; j++) out.push(list[j]?.hourly ?? null);
    } catch {
      for (let j = 0; j < chunk.length; j++) out.push(null);
    }
  }
  return out;
}

/** The game-window summary and its flags, or null when the forecast doesn't reach kickoff. */
export function summarize(
  hourly: Hourly,
  kickoffIso: string
): Omit<GameWeather, 'homeTeam' | 'awayTeam' | 'kickoff' | 'venue' | 'city' | 'summary' | 'source'> | null {
  const hour = kickoffIso.substring(0, 13) + ':00'; // "2026-10-11T17:00", the feed's UTC format
  const start = hourly.time.indexOf(hour);
  if (start === -1) return null;
  const end = Math.min(start + GAME_HOURS, hourly.time.length);
  const span = <T,>(a: T[]) => a.slice(start, end);
  const num = (a: (number | null)[]) => span(a).map((v) => v ?? 0);

  const windMph = Math.max(...num(hourly.wind_speed_10m));
  const gustMph = Math.max(...num(hourly.wind_gusts_10m));
  const precipChance = Math.max(...num(hourly.precipitation_probability));
  const precipIn = num(hourly.precipitation).reduce((a, b) => a + b, 0);
  const snowIn = num(hourly.snowfall).reduce((a, b) => a + b, 0);
  const temps = num(hourly.temperature_2m);
  const codes = span(hourly.weather_code);

  const flags: WeatherFlag[] = [];
  const storm = codes.some((c) => c >= 95); // WMO 95-99: thunderstorm
  const snow = snowIn >= SNOW_MIN_INCHES;
  const rain = precipChance >= RAIN_CHANCE_PCT && precipIn >= RAIN_MIN_INCHES;
  if (storm) flags.push('storm');
  else if (snow) flags.push('snow');
  else if (rain) flags.push('rain');
  if (windMph >= WIND_SUSTAINED_MPH || gustMph >= WIND_GUST_MPH) flags.push('wind');

  return {
    flags,
    tempF: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length),
    windMph: Math.round(windMph),
    gustMph: Math.round(gustMph),
    precipChance: Math.round(precipChance),
    precipIn: Math.round(precipIn * 100) / 100,
    snowIn: Math.round(snowIn * 10) / 10,
  };
}

// ---------------------------------------------------- National Weather Service
// The official US forecast, and the one to believe for US venues: on
// 2026-10-10 Open-Meteo had Duke at Georgia Tech dry (38%, wind 12 mph) while
// the NWS had showers and thunderstorms at 80%+ with 15-20 mph wind. Public
// domain, no key; it asks for a User-Agent naming the app.
const NWS_HEADERS = { 'User-Agent': 'odds.day game weather (https://www.odds.day)', Accept: 'application/geo+json' };

interface NwsHour {
  startTime: string;
  temperature: number;
  windSpeed: string; // "20 mph" or "10 to 15 mph"
  probabilityOfPrecipitation?: { value: number | null };
  shortForecast: string;
}

async function nwsHours(lat: number, lon: number): Promise<NwsHour[] | null> {
  try {
    // Which forecast grid the stadium is in — fixed, so kept for a month
    const point = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: NWS_HEADERS,
      next: { revalidate: 60 * 60 * 24 * 30 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!point.ok) return null;
    const url = ((await point.json()) as { properties?: { forecastHourly?: string } }).properties?.forecastHourly;
    if (!url) return null;
    const res = await fetch(url, { headers: NWS_HEADERS, next: { revalidate: 1800 }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return ((await res.json()) as { properties?: { periods?: NwsHour[] } }).properties?.periods ?? null;
  } catch {
    return null;
  }
}

interface NwsSummary {
  flags: WeatherFlag[];
  tempF: number;
  windMph: number;
  precipChance: number;
  summary: string;
}

/** The NWS view of the game window, or null when its forecast doesn't reach kickoff. */
function summarizeNws(hours: NwsHour[], kickoffIso: string): NwsSummary | null {
  const start = new Date(kickoffIso.substring(0, 13) + ':00:00Z').getTime();
  const end = start + GAME_HOURS * 3_600_000;
  const span = hours.filter((h) => {
    const t = new Date(h.startTime).getTime();
    return t >= start && t < end;
  });
  if (span.length === 0) return null;

  const chance = (h: NwsHour) => h.probabilityOfPrecipitation?.value ?? 0;
  const wind = (h: NwsHour) => Math.max(0, ...(h.windSpeed.match(/\d+/g) ?? []).map(Number)); // top of a "10 to 15 mph" range
  const windMph = Math.max(...span.map(wind));
  const precipChance = Math.max(...span.map(chance));
  // Wording for the detail line: the wettest hour that actually talks about
  // precipitation (a 99% hour can read "Patchy Fog"), else just the wettest
  const wetWords = span.filter((h) => /thunder|rain|shower|drizzle|snow|sleet|wintry/i.test(h.shortForecast));
  const wettest = (wetWords.length ? wetWords : span).reduce((a, b) => (chance(b) > chance(a) ? b : a));

  const flags: WeatherFlag[] = [];
  const any = (re: RegExp, minChance: number) => span.some((h) => re.test(h.shortForecast) && chance(h) >= minChance);
  if (any(/thunder/i, NWS_STORM_SNOW_CHANCE_PCT)) flags.push('storm');
  else if (any(/snow|sleet|wintry|flurr|freezing/i, NWS_STORM_SNOW_CHANCE_PCT)) flags.push('snow');
  else if (any(/rain|shower|drizzle/i, NWS_RAIN_CHANCE_PCT)) flags.push('rain');
  if (windMph >= WIND_SUSTAINED_MPH) flags.push('wind');

  return {
    flags,
    tempF: Math.round(span.reduce((a, h) => a + h.temperature, 0) / span.length),
    windMph,
    precipChance,
    summary: wettest.shortForecast,
  };
}

/** Weather for every outdoor, not-yet-finished game ESPN lists this week. Flagged or not. */
export async function gameWeather(sport: string): Promise<GameWeather[]> {
  if (!WEATHER_SPORTS.has(sport)) return [];
  const games = sport === CFL ? await cflGames() : await outdoorGames(sport);

  // one lookup per distinct city, eight at a time
  const keys = Array.from(new Set(games.filter((g) => g.lat === undefined).map((g) => `${g.city}|${g.state}`)));
  const coords = new Map<string, { lat: number; lon: number } | null>();
  for (let i = 0; i < keys.length; i += 8) {
    const batch = keys.slice(i, i + 8);
    const found = await Promise.all(batch.map((k) => geocode(...(k.split('|') as [string, string]))));
    batch.forEach((k, j) => coords.set(k, found[j]));
  }
  const located: { game: Venue; lat: number; lon: number }[] = [];
  for (const g of games) {
    const p = g.lat !== undefined && g.lon !== undefined ? { lat: g.lat, lon: g.lon } : coords.get(`${g.city}|${g.state}`);
    if (p) located.push({ game: g, lat: p.lat, lon: p.lon });
  }

  // Open-Meteo for every venue (it has gusts and amounts, and covers games
  // abroad); the NWS on top for US venues, one request per distinct city.
  const hourly = await forecasts(located);
  const nwsByCity = new Map<string, NwsHour[] | null>();
  const usKeys = Array.from(new Set(located.filter((l) => STATE_NAMES[l.game.state.toUpperCase()]).map((l) => `${l.game.city}|${l.game.state}`)));
  for (let i = 0; i < usKeys.length; i += 10) {
    const batch = usKeys.slice(i, i + 10);
    const found = await Promise.all(
      batch.map((k) => {
        const p = coords.get(k)!;
        return nwsHours(p.lat, p.lon);
      })
    );
    batch.forEach((k, j) => nwsByCity.set(k, found[j]));
  }

  const out: GameWeather[] = [];
  located.forEach(({ game }, i) => {
    const h = hourly[i];
    const om = h ? summarize(h, game.kickoff) : null;
    const nwsHoursHere = nwsByCity.get(`${game.city}|${game.state}`);
    const nws = nwsHoursHere ? summarizeNws(nwsHoursHere, game.kickoff) : null;
    if (!om && !nws) return;

    // A game is flagged when EITHER forecast says so — missing a bad-weather
    // game is the worse mistake. One precipitation icon (the worst), plus wind.
    const has = (f: WeatherFlag) => !!om?.flags.includes(f) || !!nws?.flags.includes(f);
    const flags: WeatherFlag[] = [];
    if (has('storm')) flags.push('storm');
    else if (has('snow')) flags.push('snow');
    else if (has('rain')) flags.push('rain');
    if (has('wind')) flags.push('wind');

    out.push({
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      kickoff: game.kickoff,
      venue: game.venue,
      city: game.state ? `${game.city}, ${game.state}` : game.city,
      flags,
      tempF: nws?.tempF ?? om!.tempF,
      windMph: Math.max(nws?.windMph ?? 0, om?.windMph ?? 0),
      gustMph: om?.gustMph ?? 0,
      precipChance: Math.max(nws?.precipChance ?? 0, om?.precipChance ?? 0),
      precipIn: om?.precipIn ?? 0,
      snowIn: om?.snowIn ?? 0,
      summary: nws?.summary,
      source: nws ? 'nws' : 'open-meteo',
    });
  });
  return out;
}
