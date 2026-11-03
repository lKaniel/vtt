import { describe, expect, it } from 'vitest';
import { foundryWeather } from './foundry-weather.ts';

const fx = (effects: Record<string, unknown>, filters?: Record<string, unknown>) => ({
  flags: { fxmaster: { effects, ...(filters ? { filters } : {}) } },
});

describe('foundryWeather', () => {
  it("turns FXMaster's particle effects into weather layers, about as thick, with their tint", () => {
    const scene = fx({
      a: { type: 'clouds', options: { density: 0.03, tint: { apply: false, value: '#ffffff' } } },
      b: { type: 'embers', options: { density: 1.4, tint: { apply: true, value: '#59ff00' } } },
      c: { type: 'crows', options: {} },
      d: { type: 'raintop', options: { density: 0.25 } },
    });
    expect(foundryWeather(scene)).toEqual({
      weather: [
        { kind: 'clouds', density: 0.5 },
        { kind: 'embers', density: 1, tint: '#59ff00' },
        { kind: 'birds', density: 0.5 },
        { kind: 'rain', density: 0.25 },
      ],
      skipped: [],
    });
  });

  it("reads Foundry's own scene weather, and reports what has no match", () => {
    expect(foundryWeather({ weather: 'rainStorm' }).weather).toEqual([
      { kind: 'rain', density: 0.9 },
      { kind: 'clouds', density: 0.7, tint: '#5a606c' },
    ]);
    expect(foundryWeather({ weather: '' })).toEqual({ skipped: [] });
    const odd = fx({ r: { type: 'rats', options: {} } }, { s: { type: 'color' } });
    expect(foundryWeather(odd)).toEqual({
      skipped: [
        { what: 'FXMaster effects we have no weather for', count: 1, examples: ['rats'] },
        { what: 'FXMaster filters (colour, blur, lightning)', count: 1, examples: ['color'] },
      ],
    });
  });
});
