import { type ImportLoss } from '@vtt/core';
import type { Weather, WeatherKind } from '@vtt/shared';
import { lost } from './import-losses.ts';

// A Foundry scene's weather as ours (shared/weather.ts): FXMaster's particle
// effects (flags.fxmaster.effects) layer by layer, about as thick as they
// were, or else Foundry's own scene weather. FXMaster's filters and the
// effects we have no layer for are reported.

const obj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

/** Each FXMaster effect: our kind, and its default density (ours is half as thick at that). */
const FX: Record<string, [WeatherKind, number]> = {
  rain: ['rain', 0.5],
  raintop: ['rain', 0.5],
  snow: ['snow', 0.5],
  snowstorm: ['snow', 0.5],
  clouds: ['clouds', 0.03],
  fog: ['fog', 0.08],
  embers: ['embers', 0.7],
  birds: ['birds', 0.006],
  crows: ['birds', 0.006],
  eagles: ['birds', 0.006],
  bats: ['birds', 0.006],
};

const storm: Weather[] = [
  { kind: 'rain', density: 0.9 },
  { kind: 'clouds', density: 0.7, tint: '#5a606c' },
];
/** Foundry's own weather (scene.weather), as our presets. */
const CORE: Record<string, Weather[]> = {
  rain: [{ kind: 'rain', density: 0.6 }],
  rainStorm: storm,
  snow: [{ kind: 'snow', density: 0.5 }],
  blizzard: [{ kind: 'snow', density: 1, wind: 0.6 }],
  fog: [{ kind: 'fog', density: 0.5 }],
  fogHeavy: [{ kind: 'fog', density: 0.9 }],
};

const round = (n: number) => Math.round(n * 100) / 100;

function layerOf(effect: Record<string, unknown>): Weather | undefined {
  const match = FX[String(effect.type)];
  if (!match) return undefined;
  const [kind, usual] = match;
  const options = obj(effect.options);
  const density = typeof options.density === 'number' ? options.density : usual;
  const tint = obj(options.tint);
  return {
    kind,
    density: round(Math.min(1, Math.max(0.05, (density / usual) * 0.5))),
    ...(tint.apply === true && typeof tint.value === 'string' ? { tint: tint.value } : {}),
  };
}

/** The weather a Foundry scene has, and what of it could not come along. */
export function foundryWeather(scene: unknown): { weather?: Weather[]; skipped: ImportLoss[] } {
  const s = obj(scene);
  const fx = obj(obj(s.flags).fxmaster);
  const effects = Object.values(obj(fx.effects)).map(obj);
  const filters = Object.values(obj(fx.filters)).map((f) => String(obj(f).type));
  const layers = effects.flatMap((e) => layerOf(e) ?? []);
  const unmatched = effects.filter((e) => !layerOf(e)).map((e) => String(e.type));
  const skipped = [
    ...(unmatched.length ? [lost('FXMaster effects we have no weather for', unmatched.length, unmatched)] : []),
    ...(filters.length ? [lost('FXMaster filters (colour, blur, lightning)', filters.length, filters)] : []),
  ];
  const weather = layers.length ? layers : CORE[String(s.weather)];
  return { ...(weather ? { weather } : {}), skipped };
}
