import { z } from 'zod';
import { type Calendar, dateOf, HOUR } from './clock.ts';
import type { Weather } from './weather.ts';

// Weather that changes with world time (clock.ts), like Simple Weather: a
// scene names the weathers it can have, how likely each is and in which
// months, and how many hours one lasts. Like daylight, the weather is worked
// out from the time, never stored: skipping time or undoing it just works.

export interface WeatherPreset {
  id: string;
  label: string;
  layers: Weather[];
}

const one = (kind: Weather['kind'], label: string): WeatherPreset => ({
  id: kind,
  label,
  layers: [{ kind, density: 0.5 }],
});

export const WEATHER_PRESETS: readonly WeatherPreset[] = [
  one('rain', 'Rain'),
  one('snow', 'Snow'),
  one('clouds', 'Cloud shadows'),
  one('fog', 'Fog'),
  one('embers', 'Embers'),
  one('birds', 'Birds'),
  {
    id: 'storm',
    label: 'Storm',
    layers: [
      { kind: 'rain', density: 0.9, wind: 0.4 },
      { kind: 'clouds', density: 0.7, wind: 0.4, tint: '#5a606c' },
    ],
  },
  {
    id: 'blizzard',
    label: 'Blizzard',
    layers: [
      { kind: 'snow', density: 1, wind: 0.7 },
      { kind: 'fog', density: 0.6, wind: 0.5 },
    ],
  },
  {
    id: 'wildfire',
    label: 'Wildfire',
    layers: [
      { kind: 'embers', density: 0.9, wind: 0.2 },
      { kind: 'fog', density: 0.5, tint: '#4a3a32' },
    ],
  },
];

const option = z.object({
  /** A preset id (see WEATHER_PRESETS), or "clear" for none. */
  weather: z.string().min(1),
  /** How likely it is against the others (default 1; 0 never). */
  weight: z.number().min(0).default(1),
  /** Months it comes up in (indexes into the calendar's months); missing: all year. */
  months: z.array(z.number().int().min(0)).optional(),
});

/** scene.json `weatherCycle`. */
export const WeatherCycleSchema = z.object({
  /** Hours one weather lasts before the next is drawn. */
  every: z.number().positive().default(4),
  options: z.array(option).min(1),
});
export type WeatherCycle = z.infer<typeof WeatherCycleSchema>;

/** Which stretch of `every` hours `time` falls in. */
export function weatherPeriod(cycle: WeatherCycle, time: number): number {
  return Math.floor(time / (cycle.every * HOUR));
}

/** A number in [0, 1) that is always the same for the same text (FNV-1a). */
function hashUnit(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0x1_0000_0000;
}

function pick(options: WeatherCycle['options'], roll: number): string | undefined {
  const total = options.reduce((n, o) => n + o.weight, 0);
  let left = roll * total;
  return options.find((o) => (left -= o.weight) < 0)?.weather;
}

/** The weather layers a scene has at `time`; `seed` (the scene id) keeps scenes apart. */
export function weatherAt(cycle: WeatherCycle, calendar: Calendar, time: number, seed: string): Weather[] {
  const period = weatherPeriod(cycle, time);
  const month = dateOf(calendar, period * cycle.every * HOUR).month;
  const open = cycle.options.filter((o) => !o.months || o.months.includes(month));
  const id = pick(open, hashUnit(`${seed}:${period}`));
  return structuredClone(WEATHER_PRESETS.find((p) => p.id === id)?.layers ?? []);
}
