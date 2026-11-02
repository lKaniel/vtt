import { type Weather, type WeatherCycle, WeatherCycleSchema, WEATHER_PRESETS } from '@vtt/shared';

export { WEATHER_PRESETS } from '@vtt/shared';

// The weather a GM puts on a scene (ui/WeatherFields.tsx): presets that add
// one layer or a few (a storm is rain under clouds), and edits to a layer;
// or the weathers it turns between as world time passes (weather-cycle.ts).

/** The weather with a preset's layers added (none for an unknown preset). */
export function addWeather(weather: readonly Weather[] | undefined, preset: string): Weather[] {
  const found = WEATHER_PRESETS.find((p) => p.id === preset);
  return [...(weather ?? []), ...structuredClone(found?.layers ?? [])];
}

/** One layer changed; a wind of 0 or an empty tint is left out. */
export function setWeather(weather: readonly Weather[], index: number, patch: Partial<Weather>): Weather[] {
  return weather.map((w, i) => {
    if (i !== index) return w;
    const next = { ...w, ...patch };
    if (!next.wind) delete next.wind;
    if (!next.tint) delete next.tint;
    return next;
  });
}

/** One layer taken away; null (the patch that removes the field) when none are left. */
export function removeWeather(weather: readonly Weather[], index: number): Weather[] | null {
  const rest = weather.filter((_, i) => i !== index);
  return rest.length ? rest : null;
}

/** What the weather can turn to as time passes: clear skies, then the presets. */
export const CYCLE_CHOICES: readonly { value: string; label: string }[] = [
  { value: 'clear', label: 'Clear' },
  ...WEATHER_PRESETS.map((p) => ({ value: p.id, label: p.label })),
];

/** The weathers a scene's `weatherCycle` turns between. */
export function cycleWeathers(value: unknown): string[] {
  return WeatherCycleSchema.safeParse(value).data?.options.map((o) => o.weather) ?? [];
}

/** One weather put in or taken out of the cycle; null (the field goes) when none are left. */
export function toggleCycleWeather(value: unknown, weather: string): WeatherCycle | null {
  const cycle = WeatherCycleSchema.safeParse(value).data ?? { every: 4, options: [] };
  const has = cycle.options.some((o) => o.weather === weather);
  const options = has ? cycle.options.filter((o) => o.weather !== weather) : [...cycle.options, { weather, weight: 1 }];
  return options.length ? { ...cycle, options } : null;
}
