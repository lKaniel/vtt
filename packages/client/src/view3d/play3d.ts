import type { DrawnTile, Point, TileDoor, Wall } from '@vtt/shared';
import { lightOf } from '@vtt/system-dnd5e';
import * as THREE from 'three';
import type { EffectsLayer } from '../canvas/EffectsLayer.ts';
import type { TokenLayer } from '../canvas/TokenLayer.ts';
import type { Session } from '../session/session.ts';
import type { ObjectRef } from '../play/objects.ts';
import { Leaves, type ModelDoor, ModelDoors } from './doors3d.ts';
import { type Body, Effects3D } from './effects3d.ts';
import { FlightMarks } from './flight3d.ts';
import { TriggerMarks, triggerMarks } from './triggers3d.ts';
import { type Carried, Lamps, lampsOf } from './lamps3d.ts';
import { quality3d } from './quality3d.ts';
import type { Standing } from './scene3d.ts';
import { doorBoxes, type DoorBox, type FloorSpan } from './walls3d.ts';

// What happens in play under the 3D view, beside the scenery View3D stands
// (one hook there): attacks and spells as 3D effects (effects3d.ts), the
// creatures' lunges and flinches that go with them, and the shadows and
// heights of those flying (flight3d.ts), and the scene's lights lighting
// the models round them (lamps3d.ts).

/** What play in 3D needs of the 3D view. */
export interface Play3DHost {
  readonly map: {
    readonly effects: Pick<EffectsLayer, 'relay'>;
    readonly tokens: Pick<TokenLayer, 'placeOf' | 'release'>;
  };
  readonly session: Pick<Session, 'tokens' | 'chunks' | 'world' | 'isGm'>;
  /** The floor shown and the ground at a point, pixels up. */
  floor(): number;
  groundAt(p: Point): number;
  /** What a creature on the floor shown would stand on at a point (a floor, a ledge), pixels up. */
  surfaceAt(p: Point): number;
  /** Pixels per foot and per square. */
  px(): number;
  grid(): number;
  /** What the camera looks at, on the map. */
  target(): Point;
  /** The standing copies of a model by its key (models3d.ts). */
  copiesOf(key: string): readonly THREE.Object3D[];
  /** Your creature is inside a building, where lamps burn as bright as at night. */
  indoors(): boolean;
}

/** A door model tile: its model's key, how it moves, its file. */
interface DoorTile {
  key: string;
  look: TileDoor;
  src: string;
}

export class Play3D {
  readonly group = new THREE.Group();
  private fx: Effects3D;
  private flight = new FlightMarks();
  private triggers = new TriggerMarks();
  private lamps: Lamps;
  private leaves = new Leaves();
  private modelDoors = new ModelDoors();
  private leafBoxes: DoorBox[] = [];
  private doorTiles: DoorTile[] = [];
  /** Door walls' states, and the tile each door wall moves. */
  private doorStates = new Map<string, boolean>();
  private movedBy = new Map<string, string>();
  /** The creatures as the last frame stood them. */
  private stood = new Map<string, Standing>();

  constructor(
    private readonly host: Play3DHost,
    /** How many scene lights shine at once: what the graphics setting allows. */
    lamps = quality3d().lights,
  ) {
    this.lamps = new Lamps(lamps);
    this.fx = new Effects3D({
      body: (id) => this.body(id),
      groundAt: (p) => host.groundAt(p),
      px: () => host.px(),
      released: (id, now) => host.map.tokens.release(id, now),
    });
    this.group.add(this.fx.group, this.flight.group, this.lamps.group, this.leaves.group, this.triggers.group);
  }

  /** Takes the attack and spell cues from the flat map while the 3D view is on. */
  start(): void {
    this.host.map.effects.relay = (cues, now) => this.fx.play(cues, now);
  }

  /** A creature as it stands this moment: off its spot while it lunges or shakes, flashing while struck. */
  pose(s: Standing, now: number): Standing {
    const [dx, dy] = this.fx.offsetOf(s.id, s.size, now);
    const tint = this.fx.tintOf(s.id, now);
    return { ...s, at: [s.at[0] + dx, s.at[1] + dy], ...(tint && { tint }) };
  }

  /** Where a creature with a figure stands this moment (its lunge). */
  placeOf(id: string, now: number): { at: Point } | undefined {
    const place = this.host.map.tokens.placeOf(id);
    if (!place) return undefined;
    const [dx, dy] = this.fx.offsetOf(id, this.sizeOf(id) ?? 0, now);
    return { at: [place.at[0] + dx, place.at[1] + dy] };
  }

  /** Moves the effects; `standing` is how this frame stood the creatures. */
  frame(standing: readonly Standing[], now: number): void {
    this.stood = new Map(standing.map((s) => [s.id, s]));
    this.fx.tick(now);
    this.flight.show(standing, this.host.floor(), this.host.px());
    this.triggers.tick(now, this.host.px());
    this.light(now);
    this.swing(now);
  }

  /** The doors on the floor shown (`walls`, `span`) and the door models among `tiles`; worked out with the walls. */
  doors(walls: readonly Wall[], span: FloorSpan, tiles: readonly DrawnTile[]): void {
    this.doorTiles = [];
    this.movedBy.clear();
    const gm = this.host.session.isGm();
    this.triggers.show(triggerMarks(tiles, gm), (p) => this.host.surfaceAt(p), this.host.px());
    for (const t of tiles) {
      if (t.kind !== 'image' || !t.door || !t.model) continue;
      this.doorTiles.push({ key: `tile:${t.id}`, look: t.door, src: t.model.src });
      this.movedBy.set(t.door.wall, t.id);
    }
    this.leafBoxes = doorBoxes(walls, span, new Set(this.movedBy.keys()));
    // Door models move on every floor, and stand where walls are not drawn (view3d.walls false) too.
    const every = [...this.host.session.chunks.values()].flatMap((c) => c.walls);
    this.doorStates = new Map(every.filter((w) => w.door).map((w) => [w.id, w.door === 'open']));
  }

  /** The model key to light gold for the object under the pointer: a tile's, or the model a door moves. */
  glowOf(hover: ObjectRef | undefined): string | undefined {
    if (hover?.kind === 'tile') return `tile:${hover.id}`;
    const tile = hover?.kind === 'door' ? this.movedBy.get(hover.id) : undefined;
    return tile && `tile:${tile}`;
  }

  /** Swings the doors' leaves and moves the door models toward their walls' states. */
  private swing(now: number): void {
    this.leaves.show(this.leafBoxes, this.host.floor(), now);
    const doors: ModelDoor[] = this.doorTiles.map((d) => ({ ...d, open: this.doorStates.get(d.look.wall) ?? false }));
    const src = new Map(this.doorTiles.map((d) => [d.key, d.src]));
    this.modelDoors.update(
      doors,
      (key) => this.host.copiesOf(key),
      now,
      (key) => src.get(key),
    );
  }

  /** The scene's lights and those creatures carry, nearest the camera first. */
  private light(now: number): void {
    const { session } = this.host;
    const world = session.world;
    if (!world) return;
    const px = this.host.px();
    const lamps = lampsOf({
      placed: [...session.chunks.values()].flatMap((c) => c.lights),
      carried: this.carried(),
      darkness: world.darkness,
      px,
      groundAt: (p) => this.host.groundAt(p),
      floorOf: (level) => (world.levels?.find((l) => l.id === level)?.bottom ?? 0) * px,
    });
    this.lamps.show(lamps, this.host.target(), now, this.host.indoors() ? 1 : world.darkness);
  }

  /** The creatures standing with a light. */
  private carried(): Carried[] {
    const out: Carried[] = [];
    for (const s of this.stood.values()) {
      const token = this.host.session.tokens.get(s.id);
      const light = token && lightOf(token);
      if (light) out.push({ id: s.id, light, at: s.at, feet: this.host.floor() + s.height, size: s.size });
    }
    return out;
  }

  dispose(): void {
    if (this.host.map.effects.relay) delete this.host.map.effects.relay;
    this.fx.dispose();
    this.flight.dispose();
    this.leaves.dispose();
    this.triggers.dispose();
  }

  private body(id: string): Body | undefined {
    const s = this.stood.get(id);
    if (s) return { at: s.at, feet: this.host.floor() + s.height, size: s.size };
    const place = this.host.map.tokens.placeOf(id);
    const size = this.sizeOf(id);
    return place && size ? { at: place.at, feet: this.host.groundAt(place.at), size } : undefined;
  }

  /** A creature's size across, pixels. */
  private sizeOf(id: string): number | undefined {
    const size = this.host.session.tokens.get(id)?.size;
    return size ? size * this.host.grid() : undefined;
  }
}
