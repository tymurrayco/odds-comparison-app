// src/components/WeatherIcons.tsx
//
// The small weather warnings on a game card: one icon per flag (storm / snow /
// rain, and wind), plus the plain-words detail line shown when it's tapped.
// Flags and thresholds come from src/lib/weather.ts; a game in fine weather
// has no flags and renders nothing.

import type { GameWeather, WeatherFlag } from '@/lib/weather';

const svg = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const CLOUD = 'M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.2 8.1 3.5 3.5 0 0 1 17 15';

const ICONS: Record<WeatherFlag, { label: string; color: string; paths: string[] }> = {
  storm: { label: 'Thunderstorms', color: 'text-amber-500', paths: [CLOUD, 'M12.5 12l-2.5 4h4l-2.5 4'] },
  snow: { label: 'Snow', color: 'text-cyan-500', paths: [CLOUD, 'M8 18.5h.01M12 18.5h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01'] },
  rain: { label: 'Rain', color: 'text-sky-500', paths: [CLOUD, 'M9 17.5l-1 3M13 17.5l-1 3M17 17.5l-1 3'] },
  wind: { label: 'Wind', color: 'text-slate-500', paths: ['M3 8.5h10a2.75 2.75 0 1 0-2.75-2.75', 'M3 12.5h15.5a2.75 2.75 0 1 1-2.75 2.75', 'M3 16.5h7'] },
};

export function WeatherIcons({ flags, className = 'h-[18px] w-[18px]' }: { flags: WeatherFlag[]; className?: string }) {
  return (
    <>
      {flags.map((f) => (
        <svg key={f} {...svg} className={`${className} ${ICONS[f].color}`} aria-hidden="true">
          {ICONS[f].paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      ))}
    </>
  );
}

/** "Rain and wind" — for the button's label and the start of the detail line. */
export function weatherHeadline(flags: WeatherFlag[]): string {
  const words = flags.map((f) => ICONS[f].label);
  const text = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1].toLowerCase()}` : words[0] ?? '';
  return text;
}

/** The facts behind the icons, in order of what matters for the game. */
export function weatherFacts(w: GameWeather): string[] {
  const facts: string[] = [`${w.tempF}°F`, `wind ${w.windMph} mph, gusts ${w.gustMph}`];
  if (w.snowIn > 0) facts.push(`${w.snowIn} in of snow`);
  if (w.precipChance >= 20 || w.precipIn > 0) facts.push(`${w.precipChance}% chance of rain${w.precipIn > 0 ? `, ${w.precipIn} in` : ''}`);
  return facts;
}
