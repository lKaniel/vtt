import { describe, expect, it } from 'vitest';
import { WeatherSchema } from '@vtt/shared';
import { shownWeather, tokenFilterLook, weatherColor } from './weather-look.ts';

const rain = WeatherSchema.parse({ kind: 'rain', density: 0.8 });
const fog = WeatherSchema.parse({ kind: 'fog', tint: '#335544' });

describe('weather on screen', () => {
  it('follows the player’s animation choice: all of it, half as thick, or none', () => {
    expect(shownWeather([rain, fog], 'full')).toEqual([rain, fog]);
    expect(shownWeather([rain], 'reduced')).toEqual([{ ...rain, density: 0.4 }]);
    expect(shownWeather([rain], 'off')).toEqual([]);
    expect(shownWeather(undefined, 'full')).toEqual([]);
  });

  it('draws each kind in its own colour unless tinted', () => {
    expect(weatherColor(fog)).toBe(0x335544);
    expect(weatherColor(WeatherSchema.parse({ kind: 'embers' }))).toBe(0xff8a2a);
  });
});

describe('token filters', () => {
  it('say which colour change to make and how see-through the picture gets', () => {
    expect(tokenFilterLook(undefined)).toBeUndefined();
    expect(tokenFilterLook('grayscale')).toEqual({ matrix: 'desaturate' });
    expect(tokenFilterLook('invert')).toEqual({ matrix: 'negative' });
    expect(tokenFilterLook('ghost')).toEqual({ matrix: 'desaturate', alpha: 0.5 });
    expect(tokenFilterLook('shadow')).toEqual({ matrix: 'brightness', amount: 0.25 });
  });
});
