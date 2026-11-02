import { describe, expect, it } from 'vitest';
import { SceneSettingsSchema, TileSchema } from './schema.ts';
import { particleCount, spawnParticle, stepParticle, WEATHER_KINDS, WeatherSchema } from './weather.ts';

const rng = () => 0.5;

describe('weather', () => {
  it('is a list of layers on the scene, each a kind and how thick it is', () => {
    const scene = SceneSettingsSchema.parse({ weather: [{ kind: 'rain' }, { kind: 'fog', density: 0.2 }] });
    expect(scene.weather).toEqual([
      { kind: 'rain', density: 0.5 },
      { kind: 'fog', density: 0.2 },
    ]);
    expect(WEATHER_KINDS).toEqual(['rain', 'snow', 'clouds', 'fog', 'embers', 'birds']);
    expect(WeatherSchema.safeParse({ kind: 'hail' }).success).toBe(false);
  });

  it('has more particles the thicker it is and the bigger the screen', () => {
    const rain = WeatherSchema.parse({ kind: 'rain' });
    expect(particleCount({ ...rain, density: 0 }, 1000, 1000)).toBe(0);
    expect(particleCount(rain, 2000, 1000)).toBe(2 * particleCount(rain, 1000, 1000));
    expect(particleCount({ ...rain, density: 1 }, 1000, 1000)).toBeGreaterThan(particleCount(rain, 1000, 1000));
    expect(particleCount(WeatherSchema.parse({ kind: 'clouds' }), 1000, 1000)).toBeLessThan(
      particleCount(rain, 1000, 1000),
    );
  });

  it('starts particles on the screen and moves them the way the kind goes', () => {
    const rain = WeatherSchema.parse({ kind: 'rain' });
    const drop = spawnParticle(rain, 800, 600, rng);
    expect(drop.x).toBeGreaterThanOrEqual(0);
    expect(drop.x).toBeLessThanOrEqual(800);
    const later = stepParticle(drop, rain, 0.1, { w: 800, h: 600 });
    expect(later.y).toBeGreaterThan(drop.y);
    const embers = WeatherSchema.parse({ kind: 'embers' });
    const spark = spawnParticle(embers, 800, 600, rng);
    expect(stepParticle(spark, embers, 0.1, { w: 800, h: 600 }).y).toBeLessThan(spark.y);
  });

  it('blows sideways with the wind and comes back round once off the screen', () => {
    const snow = WeatherSchema.parse({ kind: 'snow', wind: 1 });
    const flake = { ...spawnParticle(snow, 800, 600, rng), y: 599 };
    const next = stepParticle(flake, snow, 1, { w: 800, h: 600 });
    expect(next.y).toBeLessThan(600);
    const still = WeatherSchema.parse({ kind: 'snow' });
    const a = spawnParticle(still, 800, 600, rng);
    expect(stepParticle(a, snow, 0.1, { w: 800, h: 600 }).x).toBeGreaterThan(
      stepParticle(a, still, 0.1, { w: 800, h: 600 }).x,
    );
  });
});

describe('tile looks', () => {
  it('give pictures a drop shadow and a tint', () => {
    const tile = TileSchema.parse({
      kind: 'image',
      id: 'tree',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      src: '/a.png',
      shadow: {},
      tint: '#88aaff',
    });
    expect(tile).toMatchObject({ shadow: { offset: 12, blur: 8, alpha: 0.5 }, tint: '#88aaff' });
  });
});
