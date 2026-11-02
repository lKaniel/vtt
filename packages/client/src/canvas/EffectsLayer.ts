import type { Point } from '@vtt/shared';
import { Container } from 'pixi.js';
import { elementColor, IMPACT, type Cue, type Where } from '../feedback.ts';
import { burst, channel, floatingText, missile, rise, slash, spray, type Fx } from './fx.ts';
import type { TokenLayer } from './TokenLayer.ts';
import { videoFx } from './video-fx.ts';
import { assetUrl } from '../assets.ts';

interface Playing {
  fx: Fx;
  start: number;
}

/**
 * Plays attack and spell cues on the map: swings, missiles, bursts and
 * floating numbers, and tells the token layer when blows land.
 */
export class EffectsLayer {
  /** Effects on the ground, drawn over tokens and under fog. */
  readonly container = new Container();
  /** Floating numbers, drawn over everything so they stay readable. */
  readonly labels = new Container();
  private queue: { at: number; cue: Cue }[] = [];
  private playing: Playing[] = [];

  constructor(
    private tokens: TokenLayer,
    private gridSize: () => number,
  ) {
    this.container.eventMode = 'none';
    this.labels.eventMode = 'none';
  }

  play(cues: Cue[], now: number): void {
    for (const cue of cues) this.queue.push({ at: now + cue.at, cue });
    this.queue.sort((a, b) => a.at - b.at);
  }

  /** Starts cues that are due and moves what's playing; true while anything is. */
  tick(now: number): boolean {
    // Effects run from when they were due, so a slow frame doesn't push the timeline back.
    while (this.queue.length && this.queue[0]!.at <= now) this.start(this.queue.shift()!);
    this.playing = this.playing.filter((p) => {
      if (p.fx.update(now - p.start)) return true;
      p.fx.view.destroy();
      return false;
    });
    return this.playing.length > 0 || this.queue.length > 0;
  }

  private start({ cue, at }: { at: number; cue: Cue }): void {
    const fx = this.make(cue, at);
    if (!fx) return;
    (cue.kind === 'number' ? this.labels : this.container).addChild(fx.view);
    this.playing.push({ fx, start: at });
  }

  /** Where a token or point is now; undefined for a token this player can't see. */
  private find(where: Where): { at: Point; r: number } | undefined {
    if (typeof where !== 'string') return { at: where, r: this.gridSize() * 0.42 };
    return this.tokens.placeOf(where);
  }

  private feet(ft: number): number {
    return (ft / 5) * this.gridSize();
  }

  /** Builds the effect for a cue, or does its token-layer part; undefined when there's nothing to draw. */
  private make(cue: Cue, now: number): Fx | undefined {
    switch (cue.kind) {
      case 'lunge':
        this.tokens.lunge(cue.token, cue.toward, now);
        return;
      case 'impact':
        return this.impact(cue, now);
      case 'number':
        return this.number(cue, now);
      case 'video':
        return this.between(cue.from, cue.to, (a, b) => videoFx(assetUrl(cue.src), a, b, cue.ranged));
      default:
        return this.drawn(cue);
    }
  }

  /** The target flinches, and sparks of the blow's colour fly off it. */
  private impact(cue: Extract<Cue, { kind: 'impact' }>, now: number): Fx | undefined {
    this.tokens.flinch(cue.token, impactTint(cue.element), now);
    const place = this.find(cue.token);
    return place && burst(place.at, place.r * 1.4, elementColor(cue.element));
  }

  private number(cue: Extract<Cue, { kind: 'number' }>, now: number): Fx | undefined {
    const place = this.find(cue.token);
    if (!place) return;
    this.tokens.release(cue.token, now);
    const scale = this.gridSize() / 100;
    return floatingText([place.at[0], place.at[1] - place.r], cue.text, cue.tone, scale);
  }

  private drawn(cue: Exclude<Cue, { kind: 'lunge' | 'impact' | 'number' | 'video' }>): Fx | undefined {
    const color = elementColor(cue.element);
    switch (cue.kind) {
      case 'slash':
        return this.between(cue.from, cue.to, (a, b) => slash(a.at, b.at, b.r, color));
      case 'missile': {
        const style = {
          color,
          style: cue.style,
          duration: cue.duration,
          jagged: cue.jagged ?? cue.element === 'lightning',
        };
        return this.between(cue.from, cue.to, (a, b) => missile(a.at, b.at, style));
      }
      case 'spray':
        return this.spray(cue, color);
      case 'burst': {
        const at = this.find(cue.where);
        return at && burst(at.at, this.feet(cue.radius), color);
      }
      case 'channel':
      case 'glow': {
        const at = this.find(cue.token);
        return at && (cue.kind === 'channel' ? channel : rise)(at.at, at.r, color);
      }
    }
  }

  /** A cone or line of sparks; a line of lightning is one long jagged bolt. */
  private spray(cue: Extract<Cue, { kind: 'spray' }>, color: number): Fx | undefined {
    const from = this.find(cue.from);
    if (!from) return;
    const length = this.feet(cue.length);
    if (cue.wide || cue.element !== 'lightning') return spray(from.at, cue.to, length, { color, wide: cue.wide });
    const [x, y] = from.at;
    const d = Math.hypot(cue.to[0] - x, cue.to[1] - y) || 1;
    const end: Point = [x + ((cue.to[0] - x) / d) * length, y + ((cue.to[1] - y) / d) * length];
    return missile(from.at, end, { color, style: 'orb', duration: IMPACT.spray + 300, jagged: true });
  }

  private between(from: Where, to: Where, make: (a: { at: Point; r: number }, b: { at: Point; r: number }) => Fx) {
    const a = this.find(from);
    const b = this.find(to);
    return a && b ? make(a, b) : undefined;
  }
}

/** Weapons flash red; magic flashes in its own colour, mixed toward red. */
function impactTint(element: Parameters<typeof elementColor>[0]): number {
  return element === 'steel' ? 0xff4a3a : elementColor(element);
}
