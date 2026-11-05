import { type DrawnTile, type Point, tileClickable, tileWorks } from '@vtt/shared';
import * as THREE from 'three';

// Active tiles (tile triggers, like Monk's Active Tiles) in the 3D view. In
// 3D scenes they are mostly invisible tiles over a lever, a door or a pad,
// so the view floats a small marker over each one you may click, as BG3
// lights what you can use. The GM also sees the ones that go off when
// walked onto (traps, teleporters), in another colour.

export interface TriggerMark {
  id: string;
  /** Its middle on the map. */
  at: Point;
  /** Clicked, or set off by walking onto it. */
  kind: 'click' | 'step';
}

/** The triggers to mark among `tiles` (once each): what you may click, and for the GM what goes off underfoot. */
export function triggerMarks(tiles: Iterable<DrawnTile>, gm: boolean): TriggerMark[] {
  const out = new Map<string, TriggerMark>();
  for (const t of tiles) {
    if (out.has(t.id) || !tileWorks(t)) continue;
    const kind = kindOf(t, gm);
    if (kind) out.set(t.id, { id: t.id, at: [t.x + t.w / 2, t.y + t.h / 2], kind });
  }
  return [...out.values()];
}

/** Clicked by you, or (the GM) set off underfoot; none when you have nothing to see there. */
function kindOf(t: DrawnTile, gm: boolean): TriggerMark['kind'] | undefined {
  if (tileClickable(t, gm)) return 'click';
  return gm && t.trigger!.on === 'enter' ? 'step' : undefined;
}

/** Marks are for the eye; clicks go through to the lever under them. */
const NO_HITS = () => undefined;

const COLORS = { click: 0xf0c060, step: 0x4fd1c5 };
/** How high over what is there a marker floats, and how big it is, feet. */
const LIFT = 4;
const SIZE = 0.9;

/** The markers, standing over the triggers' tiles. */
export class TriggerMarks {
  readonly group = new THREE.Group();
  private geometry = new THREE.OctahedronGeometry(1);
  private materials = {
    click: new THREE.MeshBasicMaterial({ color: COLORS.click, transparent: true, opacity: 0.9 }),
    step: new THREE.MeshBasicMaterial({ color: COLORS.step, transparent: true, opacity: 0.6 }),
  };

  /** Marks exactly `marks`, over what `heightAt` finds there (three's y); `px` is pixels per foot. */
  show(marks: readonly TriggerMark[], heightAt: (p: Point) => number, px: number): void {
    this.clear();
    for (const m of marks) {
      const mesh = new THREE.Mesh(this.geometry, this.materials[m.kind]);
      mesh.scale.set(SIZE * px, SIZE * 1.6 * px, SIZE * px);
      mesh.position.set(m.at[0], heightAt(m.at) + LIFT * px, m.at[1]);
      mesh.userData = { trigger: m.id, y: mesh.position.y };
      mesh.raycast = NO_HITS;
      this.group.add(mesh);
    }
  }

  /** Turns the markers slowly, bobbing, so they catch the eye. */
  tick(now: number, px: number): void {
    const turn = (now / 1000) * 1.2;
    for (const [i, m] of this.group.children.entries()) {
      m.rotation.y = turn + i;
      m.position.y = (m.userData.y as number) + Math.sin(now / 400 + i) * 0.4 * px;
    }
  }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.materials.click.dispose();
    this.materials.step.dispose();
  }

  private clear(): void {
    this.group.clear();
  }
}
