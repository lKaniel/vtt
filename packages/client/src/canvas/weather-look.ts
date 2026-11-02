import type { Weather, WeatherKind } from '@vtt/shared';
import type { TokenLook } from '@vtt/shared';
import type { Motion } from '../play/animations.ts';

// How the scene's weather and the tokens' colour filters look on screen
// (WeatherLayer.ts, TokenLayer.ts): the colours, and how much a player's
// animation choice lets through.

/** The weather layers to draw: all of them, half as thick with less motion, or none. */
export function shownWeather(weather: readonly Weather[] | undefined, motion: Motion): Weather[] {
  if (!weather || motion === 'off') return [];
  return motion === 'reduced' ? weather.map((w) => ({ ...w, density: w.density / 2 })) : [...weather];
}

const COLORS: Record<WeatherKind, number> = {
  rain: 0xaec4e4,
  snow: 0xffffff,
  clouds: 0xdfe3ea,
  fog: 0xc9ced6,
  embers: 0xff8a2a,
  birds: 0x1b1b1f,
};

/** A layer's colour: its tint, or its kind's. */
export function weatherColor(weather: Weather): number {
  if (weather.tint && /^#[0-9a-f]{6}$/i.test(weather.tint)) return Number.parseInt(weather.tint.slice(1), 16);
  return COLORS[weather.kind];
}

/** Which ColorMatrixFilter change a token filter makes, and how see-through its picture is. */
export interface FilterLook {
  matrix: 'desaturate' | 'sepia' | 'negative' | 'brightness';
  amount?: number;
  alpha?: number;
}

const FILTERS: Record<NonNullable<TokenLook['filter']>, FilterLook> = {
  grayscale: { matrix: 'desaturate' },
  sepia: { matrix: 'sepia' },
  invert: { matrix: 'negative' },
  ghost: { matrix: 'desaturate', alpha: 0.5 },
  shadow: { matrix: 'brightness', amount: 0.25 },
};

export const tokenFilterLook = (filter: TokenLook['filter']): FilterLook | undefined =>
  filter ? FILTERS[filter] : undefined;
