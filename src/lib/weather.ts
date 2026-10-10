// src/lib/weather.ts
//
// Game-time weather for outdoor football, for the warning icons on game cards.
// Server-side only. For each upcoming game ESPN lists (venue city + an
// "indoor" flag), the city is geocoded and the hourly forecast read for the
// three and a half hours from kickoff. A game is flagged only when the
// weather is bad enough to matter — most games return no flags.
//
// Source: Open-Meteo (forecast + geocoding, no API key). Its free tier is for
// NON-COMMERCIAL use; a commercial odds.day needs their paid plan or a swap
// to another source. Everything that talks to it is in this file.

export type WeatherFlag = 'storm' | 'snow' | 'rain' | 'wind';

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
}

// What counts as "bad enough to show"
export const WIND_SUSTAINED_MPH = 15;
export const WIND_GUST_MPH = 35;
export const RAIN_CHANCE_PCT = 50;
export const RAIN_MIN_INCHES = 0.1;
export const SNOW_MIN_INCHES = 0.1;
const GAME_HOURS = 4; // kickoff hour + the next three

const ESPN_PATH: Record<string, { path: string; queries: string[] }> = {
  americanfootball_nfl: { path: 'football/nfl', queries: [''] },
  americanfootball_ncaaf: { path: 'football/college-football', queries: ['?limit=300&groups=80', '?limit=300&groups=81'] },
};

export const WEATHER_SPORTS = new Set(Object.keys(ESPN_PATH));

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

interface Venue {
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  venue: string;
  city: string;
  state: string; // US state abbreviation, or '' abroad
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
    cfg.queries.map(async (q) => {
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
      const key = `${away}@${home}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // ESPN names some college venues "Memorial Stadium (Lincoln, NE)"; the city is shown separately
      const venue = (c?.venue?.fullName ?? '').replace(/\s*\([^)]*\)\s*$/, '');
      out.push({ homeTeam: home, awayTeam: away, kickoff: ev.date, venue, city, state: c?.venue?.address?.state ?? '' });
    }
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
export function summarize(hourly: Hourly, kickoffIso: string): Omit<GameWeather, 'homeTeam' | 'awayTeam' | 'kickoff' | 'venue' | 'city'> | null {
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

/** Weather for every outdoor, not-yet-finished game ESPN lists this week. Flagged or not. */
export async function gameWeather(sport: string): Promise<GameWeather[]> {
  if (!WEATHER_SPORTS.has(sport)) return [];
  const games = await outdoorGames(sport);

  // one lookup per distinct city, eight at a time
  const keys = Array.from(new Set(games.map((g) => `${g.city}|${g.state}`)));
  const coords = new Map<string, { lat: number; lon: number } | null>();
  for (let i = 0; i < keys.length; i += 8) {
    const batch = keys.slice(i, i + 8);
    const found = await Promise.all(batch.map((k) => geocode(...(k.split('|') as [string, string]))));
    batch.forEach((k, j) => coords.set(k, found[j]));
  }
  const located: { game: Venue; lat: number; lon: number }[] = [];
  for (const g of games) {
    const p = coords.get(`${g.city}|${g.state}`);
    if (p) located.push({ game: g, ...p });
  }

  const hourly = await forecasts(located);
  const out: GameWeather[] = [];
  located.forEach(({ game }, i) => {
    const h = hourly[i];
    const s = h ? summarize(h, game.kickoff) : null;
    if (!s) return;
    out.push({ homeTeam: game.homeTeam, awayTeam: game.awayTeam, kickoff: game.kickoff, venue: game.venue, city: game.state ? `${game.city}, ${game.state}` : game.city, ...s });
  });
  return out;
}
