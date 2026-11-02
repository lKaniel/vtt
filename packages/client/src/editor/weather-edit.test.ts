import { describe, expect, it } from 'vitest';
import { WEATHER_PRESETS, addWeather, removeWeather, setWeather } from './weather-edit.ts';

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
