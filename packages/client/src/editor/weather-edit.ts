import type { Weather } from '@vtt/shared';

// The weather a GM puts on a scene (ui/WeatherFields.tsx): presets that add
// one layer or a few (a storm is rain under clouds), and edits to a layer.

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
