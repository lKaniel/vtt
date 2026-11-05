import type { Point } from '@vtt/shared';
import * as THREE from 'three';
import type { EffectsLayer } from '../canvas/EffectsLayer.ts';
import type { TokenLayer } from '../canvas/TokenLayer.ts';
import { type Body, Effects3D } from './effects3d.ts';
import type { Standing } from './scene3d.ts';

// What happens in play under the 3D view, beside the scenery View3D stands
// (one hook there): attacks and spells as 3D effects (effects3d.ts), and the
// creatures' lunges and flinches that go with them.

/** What play in 3D needs of the 3D view. */
export interface Play3DHost {
  readonly effects: Pick<EffectsLayer, 'relay'>;
  readonly tokens: Pick<TokenLayer, 'placeOf' | 'release'>;
  /** The floor shown and the ground at a point, pixels up. */
  floor(): number;
  groundAt(p: Point): number;
  /** Pixels per foot. */
  px(): number;
  /** A creature's size across, pixels (its figure's, for one with a model). */
  sizeOf(id: string): number | undefined;
}

export class Play3D {
  readonly group = new THREE.Group();
  private fx: Effects3D;
  /** The creatures as the last frame stood them. */
  private stood = new Map<string, Standing>();

  constructor(private readonly host: Play3DHost) {
    this.fx = new Effects3D({
      body: (id) => this.body(id),
      groundAt: (p) => host.groundAt(p),
      px: () => host.px(),
      released: (id, now) => host.tokens.release(id, now),
    });
    this.group.add(this.fx.group);
  }

  /** Takes the attack and spell cues from the flat map while the 3D view is on. */
  start(): void {
    this.host.effects.relay = (cues, now) => this.fx.play(cues, now);
  }

  /** A creature as it stands this moment: off its spot while it lunges or shakes, flashing while struck. */
  pose(s: Standing, now: number): Standing {
    const [dx, dy] = this.fx.offsetOf(s.id, s.size, now);
    const tint = this.fx.tintOf(s.id, now);
    return { ...s, at: [s.at[0] + dx, s.at[1] + dy], ...(tint && { tint }) };
  }

  /** Where a creature with a figure stands this moment (its lunge). */
  placeOf(id: string, now: number): { at: Point } | undefined {
    const place = this.host.tokens.placeOf(id);
    if (!place) return undefined;
    const [dx, dy] = this.fx.offsetOf(id, this.host.sizeOf(id) ?? 0, now);
    return { at: [place.at[0] + dx, place.at[1] + dy] };
  }

  /** Moves the effects; `standing` is how this frame stood the creatures. */
  frame(standing: readonly Standing[], now: number): void {
    this.stood = new Map(standing.map((s) => [s.id, s]));
    this.fx.tick(now);
  }

  dispose(): void {
    if (this.host.effects.relay) delete this.host.effects.relay;
    this.fx.dispose();
  }

  private body(id: string): Body | undefined {
    const s = this.stood.get(id);
    if (s) return { at: s.at, feet: this.host.floor() + s.height, size: s.size };
    const place = this.host.tokens.placeOf(id);
    const size = this.host.sizeOf(id);
    return place && size ? { at: place.at, feet: this.host.groundAt(place.at), size } : undefined;
  }
}
