import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import { type Cue, elementColor, IMPACT, type Where } from '../feedback.ts';
import { lungeAt, shakeAt, type V3 } from './fx3d-motion.ts';
import { aura, blast, missile3d, number3d, type Piece, slash, sparks, stream } from './fx3d-pieces.ts';

// Attacks and spells in 3D, as BG3 plays them: arrows lob and spells fly
// from chest to chest, blasts swell off the ground, struck creatures flash
// and shake, attackers lunge, and the numbers pop up over heads. The same
// cues the flat map plays (feedback.ts) come here while the 3D view is on;
// videos (a pack's animations) stay on the flat map, laid on the ground.

/** Where a creature stands for an effect: its spot, its feet's height and how big it is, pixels. */
export interface Body {
  at: Point;
  feet: number;
  size: number;
}

/** What the effects need of the 3D view. */
export interface FxHost {
  /** A creature this player sees, where it stands now. */
  body(id: string): Body | undefined;
  /** The ground's height at a map point, pixels. */
  groundAt(p: Point): number;
  /** Pixels per foot. */
  px(): number;
  /** The creature's hit point bar may move now (the blow landed). */
  released(id: string, now: number): void;
}

/** A creature lunging or flinching: when it started, and toward where or in what colour. */
interface Motion {
  lunge?: { at: number; dir: Point };
  flinch?: { at: number; color: number };
}

const LUNGE_MS = 260;
const FLINCH_MS = 380;
/** How far a lunge reaches and a flinch shakes, as shares of the creature's size. */
const LUNGE = 0.35;
const SHAKE = 0.08;
/** Chest and head, as shares of a creature's height above its feet. */
const CHEST = 0.55;
const HEAD = 1.05;

/** The cues the flat map keeps under the 3D view: videos, laid on the ground. */
const flatOnly = (c: Cue) => c.kind === 'video';

export class Effects3D {
  readonly group = new THREE.Group();
  private queue: { at: number; cue: Cue }[] = [];
  private playing: { piece: Piece; start: number }[] = [];
  private motions = new Map<string, Motion>();

  constructor(private readonly host: FxHost) {}

  /** Queues the cues it plays; gives back the ones left to the flat map. */
  play(cues: readonly Cue[], now: number): Cue[] {
    for (const cue of cues) if (!flatOnly(cue)) this.queue.push({ at: now + cue.at, cue });
    this.queue.sort((a, b) => a.at - b.at);
    return cues.filter(flatOnly);
  }

  /** Starts what is due and moves what plays; true while anything does. */
  tick(now: number): boolean {
    let due = 0;
    while (due < this.queue.length && this.queue[due]!.at <= now) due++;
    for (const q of this.queue.splice(0, due)) this.start(q);
    const over = this.playing.filter((p) => !p.piece.update(now - p.start));
    for (const p of over) {
      this.group.remove(p.piece.object);
      p.piece.dispose();
    }
    this.playing = this.playing.filter((p) => !over.includes(p));
    return this.playing.length + this.queue.length > 0;
  }

  /** How far a creature is off its spot just now (lunging, shaking), pixels on the map. */
  offsetOf(id: string, size: number, now: number): Point {
    const m = this.motions.get(id);
    if (!m) return [0, 0];
    const l = m.lunge && (now - m.lunge.at) / LUNGE_MS;
    const f = m.flinch && (now - m.flinch.at) / FLINCH_MS;
    const out: Point = l !== undefined && l < 1 ? lungeAt(m.lunge!.dir, l, size * LUNGE) : [0, 0];
    if (f !== undefined && f < 1) out[0] += shakeAt(f, size * SHAKE);
    if ((l === undefined || l >= 1) && (f === undefined || f >= 1)) this.motions.delete(id);
    return out;
  }

  /** The colour a struck creature flashes, fading back to none. */
  tintOf(id: string, now: number): THREE.Color | undefined {
    const f = this.motions.get(id)?.flinch;
    const t = f && (now - f.at) / FLINCH_MS;
    if (!f || t === undefined || t >= 1) return undefined;
    return new THREE.Color(f.color).lerp(new THREE.Color(0xffffff), t);
  }

  dispose(): void {
    for (const p of this.playing) p.piece.dispose();
    this.playing = [];
    this.queue = [];
    this.group.clear();
  }

  private start({ cue, at }: { at: number; cue: Cue }): void {
    const piece = this.make(cue, at);
    if (!piece) return;
    piece.update(0);
    this.group.add(piece.object);
    this.playing.push({ piece, start: at });
  }

  /** A creature's chest, or a point on the ground a little above it. */
  private chest(where: Where): V3 | undefined {
    if (typeof where !== 'string') return [where[0], where[1], this.host.groundAt(where) + 3 * this.host.px()];
    const b = this.host.body(where);
    return b && [b.at[0], b.at[1], b.feet + b.size * CHEST];
  }

  private ground(where: Where): V3 | undefined {
    if (typeof where !== 'string') return [where[0], where[1], this.host.groundAt(where)];
    const b = this.host.body(where);
    return b && [b.at[0], b.at[1], b.feet];
  }

  private make(cue: Cue, now: number): Piece | undefined {
    switch (cue.kind) {
      case 'lunge':
        this.lunge(cue.token, cue.toward, now);
        return undefined;
      case 'impact':
        return this.impact(cue, now);
      case 'number':
        return this.number(cue, now);
      case 'video':
        return undefined;
      default:
        return this.drawn(cue);
    }
  }

  private lunge(id: string, toward: string, now: number): void {
    const a = this.host.body(id);
    const b = this.host.body(toward);
    if (!a || !b) return;
    const d = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) || 1;
    this.motions.set(id, {
      ...this.motions.get(id),
      lunge: { at: now, dir: [(b.at[0] - a.at[0]) / d, (b.at[1] - a.at[1]) / d] },
    });
  }

  private impact(cue: Extract<Cue, { kind: 'impact' }>, now: number): Piece | undefined {
    const color = cue.element === 'steel' ? 0xff4a3a : elementColor(cue.element);
    this.motions.set(cue.token, { ...this.motions.get(cue.token), flinch: { at: now, color } });
    this.host.released(cue.token, now);
    const b = this.host.body(cue.token);
    const at = this.chest(cue.token);
    return b && at && sparks(at, b.size * 0.45, elementColor(cue.element));
  }

  private number(cue: Extract<Cue, { kind: 'number' }>, now: number): Piece | undefined {
    this.host.released(cue.token, now);
    const b = this.host.body(cue.token);
    if (!b) return undefined;
    return number3d([b.at[0], b.at[1], b.feet + b.size * HEAD], cue.text, cue.tone, b.size * 0.35);
  }

  private drawn(cue: Exclude<Cue, { kind: 'lunge' | 'impact' | 'number' | 'video' }>): Piece | undefined {
    const color = elementColor(cue.element);
    switch (cue.kind) {
      case 'slash':
        return this.slash(cue.from, cue.to, color);
      case 'missile':
        return this.missile(cue, color);
      case 'spray':
        return this.spray(cue, color);
      case 'burst': {
        const at = this.ground(cue.where);
        return at && blast(at, (cue.radius || 5) * this.host.px(), color);
      }
      case 'channel':
      case 'glow': {
        const b = this.host.body(cue.token);
        return b && aura([b.at[0], b.at[1], b.feet], b.size / 2, { color, rising: cue.kind === 'glow' });
      }
    }
  }

  private slash(from: string, to: string, color: number): Piece | undefined {
    const a = this.chest(from);
    const b = this.chest(to);
    const target = this.host.body(to);
    return a && b && target && slash(b, a, target.size * 0.55, color);
  }

  private missile(cue: Extract<Cue, { kind: 'missile' }>, color: number): Piece | undefined {
    const a = this.chest(cue.from);
    const b = this.chest(cue.to);
    if (!a || !b) return undefined;
    const jagged = cue.jagged ?? cue.element === 'lightning';
    const flight = jagged ? 'bolt' : cue.style;
    return missile3d(flight, a, b, { color, duration: jagged ? cue.duration + 200 : cue.duration });
  }

  private spray(cue: Extract<Cue, { kind: 'spray' }>, color: number): Piece | undefined {
    const a = this.chest(cue.from);
    if (!a) return undefined;
    const d = Math.hypot(cue.to[0] - a[0], cue.to[1] - a[1]) || 1;
    const toward: [number, number] = [(cue.to[0] - a[0]) / d, (cue.to[1] - a[1]) / d];
    const length = cue.length * this.host.px();
    if (!cue.wide && cue.element === 'lightning') {
      const end: V3 = [a[0] + toward[0] * length, a[1] + toward[1] * length, a[2]];
      return missile3d('bolt', a, end, { color, duration: IMPACT.spray + 300 });
    }
    return stream(a, toward, { length, wide: cue.wide, color });
  }
}
