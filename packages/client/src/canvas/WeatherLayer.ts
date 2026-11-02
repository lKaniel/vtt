import { type Particle, particleCount, spawnParticle, stepParticle, type Weather } from '@vtt/shared';
import { BlurFilter, Container, Graphics } from 'pixi.js';
import { currentMotion } from '../play/animations.ts';
import type { Session } from '../session/session.ts';
import { shownWeather, weatherColor } from './weather-look.ts';

// The scene's weather (shared weather.ts) over the map, under the rulers and
// the editor: one Graphics per layer, redrawn each frame in screen pixels.

interface Layer {
  weather: Weather;
  particles: Particle[];
  view: Graphics;
}

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
    for (const layer of this.layers) layer.view.destroy();
    this.layers = weather.map((w) => {
      const count = particleCount(w, screen.width, screen.height);
      const particles = Array.from({ length: count }, () => spawnParticle(w, screen.width, screen.height, Math.random));
      const view = new Graphics();
      // Clouds and fog are soft: their puffs are blurred together.
      if (w.kind === 'clouds' || w.kind === 'fog') view.filters = [new BlurFilter({ strength: 24 })];
      this.container.addChild(view);
      return { weather: w, particles, view };
    });
    this.made = key;
  }
}

function draw({ weather, particles, view }: Layer): void {
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
