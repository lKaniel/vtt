import { type Particle, particleCount, spawnParticle, stepParticle, type Weather } from '@vtt/shared';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { currentMotion } from '../play/animations.ts';
import type { Session } from '../session/session.ts';
import { shownWeather, weatherColor } from './weather-look.ts';

// The scene's weather (shared weather.ts) over the map, under the rulers and
// the editor: one Graphics per layer, redrawn each frame in screen pixels.
// Clouds and fog are soft puffs: sprites of one blurred disc, made once,
// instead of a blur filter over the whole screen every frame.

interface Layer {
  weather: Weather;
  particles: Particle[];
  /** A Graphics redrawn each frame, or (soft layers) a container of puffs. */
  view: Container;
  /** Soft layers: two puffs per particle. */
  puffs?: Sprite[];
}

/** How far a soft puff's edge fades past its circle, in screen pixels. */
const SOFT_EDGE = 24;
let softDisc: Texture | undefined;

/** A white disc that fades out toward its edge, like a blurred circle. */
function softTexture(): Texture {
  if (softDisc) return softDisc;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const fade = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, a] of [
    [0, 1],
    [0.45, 0.85],
    [0.7, 0.45],
    [0.88, 0.12],
    [1, 0],
  ] as const) {
    fade.addColorStop(at, `rgba(255,255,255,${a})`);
  }
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  softDisc = Texture.from(canvas);
  return softDisc;
}

const soft = (w: Weather) => w.kind === 'clouds' || w.kind === 'fog';

export class WeatherLayer {
  readonly container = new Container();
  private layers: Layer[] = [];
  /** The weather and screen size the layers were made for. */
  private made = '';

  constructor(private session: Session) {
    this.container.eventMode = 'none';
  }

  tick(dt: number, screen: { width: number; height: number }): void {
    const weather = shownWeather(this.session.world?.weather, currentMotion());
    const key = JSON.stringify([weather, Math.round(screen.width), Math.round(screen.height)]);
    if (key !== this.made) this.rebuild(weather, screen, key);
    for (const layer of this.layers) {
      layer.particles = layer.particles.map((p) =>
        stepParticle(p, layer.weather, dt, { w: screen.width, h: screen.height }),
      );
      draw(layer);
    }
  }

  private rebuild(weather: Weather[], screen: { width: number; height: number }, key: string): void {
    for (const layer of this.layers) layer.view.destroy({ children: true });
    this.layers = weather.map((w) => {
      const count = particleCount(w, screen.width, screen.height);
      const particles = Array.from({ length: count }, () => spawnParticle(w, screen.width, screen.height, Math.random));
      const view = soft(w) ? new Container() : new Graphics();
      const puffs = soft(w) ? particles.flatMap(() => [puffSprite(view, w), puffSprite(view, w)]) : undefined;
      this.container.addChild(view);
      return { weather: w, particles, view, puffs };
    });
    this.made = key;
  }
}

function puffSprite(view: Container, w: Weather): Sprite {
  const sprite = new Sprite(softTexture());
  sprite.anchor.set(0.5);
  sprite.tint = weatherColor(w);
  view.addChild(sprite);
  return sprite;
}

/** Places a soft layer's puffs: a big one on each particle and a smaller one beside it. */
function placePuffs(particles: readonly Particle[], puffs: readonly Sprite[]): void {
  particles.forEach((p, i) => {
    const big = puffs[2 * i]!;
    const small = puffs[2 * i + 1]!;
    big.position.set(p.x, p.y);
    big.setSize(2 * (p.size + SOFT_EDGE));
    small.position.set(p.x + p.size * 0.6, p.y + p.size * 0.15);
    small.setSize(2 * (p.size * 0.7 + SOFT_EDGE));
    big.alpha = small.alpha = p.alpha * 0.5;
  });
}

function draw({ weather, particles, view, puffs }: Layer): void {
  if (puffs) return placePuffs(particles, puffs);
  if (!(view instanceof Graphics)) return;
  const color = weatherColor(weather);
  view.clear();
  for (const p of particles) DRAW[weather.kind](view, p, color, weather);
}

type Draw = (g: Graphics, p: Particle, color: number, weather: Weather) => void;

const puff: Draw = (g, p, color) => {
  g.circle(p.x, p.y, p.size).fill({ color, alpha: p.alpha * 0.5 });
  g.circle(p.x + p.size * 0.6, p.y + p.size * 0.15, p.size * 0.7).fill({ color, alpha: p.alpha * 0.5 });
};

const DRAW: Record<Weather['kind'], Draw> = {
  rain: (g, p, color, w) => {
    const slant = (w.wind ?? 0) * 0.3;
    g.moveTo(p.x, p.y)
      .lineTo(p.x - slant * p.size, p.y - p.size)
      .stroke({ color, alpha: p.alpha, width: 1 });
  },
  snow: (g, p, color) => {
    g.circle(p.x, p.y, p.size).fill({ color, alpha: p.alpha });
  },
  clouds: puff,
  fog: puff,
  embers: (g, p, color) => {
    g.circle(p.x, p.y, p.size).fill({ color, alpha: p.alpha * (0.6 + 0.4 * Math.sin(p.phase * 3)) });
  },
  birds: (g, p, color) => {
    const flap = Math.sin(p.phase * 4) * p.size * 0.5;
    g.moveTo(p.x - p.size, p.y - flap)
      .lineTo(p.x, p.y)
      .lineTo(p.x + p.size, p.y - flap)
      .stroke({ color, alpha: p.alpha, width: 1.5 });
  },
};
