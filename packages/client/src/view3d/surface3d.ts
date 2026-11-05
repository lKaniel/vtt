import * as THREE from 'three';

// What a creature stands on in the 3D view: the terrain or a model's floor
// (a bridge, a house) under it, as 3D Canvas stands tokens on what is below
// them. Reached from its feet a step up, so it climbs a kerb but stays under
// a bridge it walks beneath; when everything is above it, the top.

export class Surface {
  private ray = new THREE.Raycaster();
  private known = new Map<string, { key: string; y: number | undefined }>();

  /** `step`: how far above its feet (pixels) a creature still steps onto. */
  constructor(
    private readonly solids: () => THREE.Object3D[],
    private readonly step: () => number,
  ) {}

  /** Three's y of the surface under map point `at` for a creature whose feet are at `feet`; none off every surface. */
  under(id: string, at: readonly [number, number], feet: number): number | undefined {
    const key = `${at[0]},${at[1]},${feet}`;
    const was = this.known.get(id);
    if (was?.key === key) return was.y;
    const y = this.hit(at, feet + this.step()) ?? this.hit(at, 1e7);
    this.known.set(id, { key, y });
    return y;
  }

  /** Three's y of the surface under map point `at` a walker with feet at `feet` steps on (up to `step` higher); `feet` when there is none. */
  at(at: readonly [number, number], feet: number, step = this.step()): number {
    return this.hit(at, feet + step) ?? feet;
  }

  /** Forgets what it knew (the surfaces changed). */
  forget(): void {
    this.known.clear();
  }

  private hit([x, z]: readonly [number, number], from: number): number | undefined {
    this.ray.set(new THREE.Vector3(x, from, z), new THREE.Vector3(0, -1, 0));
    return this.ray.intersectObjects(this.solids(), true)[0]?.point.y;
  }
}
