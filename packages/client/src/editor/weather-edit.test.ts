import { describe, expect, it } from 'vitest';
import {
  CYCLE_CHOICES,
  WEATHER_PRESETS,
  addWeather,
  cycleWeathers,
  removeWeather,
  setWeather,
  toggleCycleWeather,
} from './weather-edit.ts';

describe('the scene’s weather', () => {
  it('adds a preset’s layers after the ones it has', () => {
    expect(WEATHER_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining(['rain', 'snow', 'clouds', 'fog', 'embers', 'birds', 'storm', 'blizzard', 'wildfire']),
    );
    const rain = addWeather(undefined, 'rain');
    expect(rain).toEqual([{ kind: 'rain', density: 0.5 }]);
    expect(addWeather(rain, 'storm').map((w) => w.kind)).toEqual(['rain', 'rain', 'clouds']);
    expect(addWeather(rain, 'nothing')).toEqual(rain);
  });

  it('changes one layer and takes one away; no layers left is no weather', () => {
    const two = addWeather(addWeather(undefined, 'rain'), 'fog');
    expect(setWeather(two, 1, { density: 0.9 })[1]).toEqual({ kind: 'fog', density: 0.9 });
    expect(setWeather(two, 0, { wind: 0 })[0]).toEqual({ kind: 'rain', density: 0.5 });
    expect(removeWeather(two, 0)).toEqual([{ kind: 'fog', density: 0.5 }]);
    expect(removeWeather([two[0]!], 0)).toBeNull();
  });
});

describe('weather that changes with the time', () => {
  it('picks the weathers a scene can have, keeping how often each comes up', () => {
    const rain = toggleCycleWeather(undefined, 'rain');
    expect(rain).toEqual({ every: 4, options: [{ weather: 'rain', weight: 1 }] });
    const both = toggleCycleWeather({ ...rain!, every: 6 }, 'clear');
    expect(both).toEqual({
      every: 6,
      options: [
        { weather: 'rain', weight: 1 },
        { weather: 'clear', weight: 1 },
      ],
    });
    expect(toggleCycleWeather(both, 'rain')).toEqual({ every: 6, options: [{ weather: 'clear', weight: 1 }] });
    // None left: the weather no longer changes (the field goes).
    expect(toggleCycleWeather({ every: 6, options: [{ weather: 'clear', weight: 1 }] }, 'clear')).toBeNull();
  });

  it('reads the weathers picked and offers clear skies besides the presets', () => {
    expect(cycleWeathers({ every: 4, options: [{ weather: 'fog', weight: 2 }] })).toEqual(['fog']);
    expect(cycleWeathers('junk')).toEqual([]);
    expect(CYCLE_CHOICES[0]).toEqual({ value: 'clear', label: 'Clear' });
  });
});
