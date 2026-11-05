import { levelAt, onLevel, type Point, tokenLevel, type WorldInfo } from '@vtt/shared';
import * as THREE from 'three';
import { listenToDrops } from '../canvas/sidebar-drops.ts';
import type { TokenLayer } from '../canvas/TokenLayer.ts';
import { portraitOf } from '../icon-art.ts';
import type { Session } from '../session/session.ts';
import {
  figures,
  onShownFloor,
  type SolidShown,
  type Table3D,
  type TerrainShown,
  tileModels,
  tileSolids,
  tileTerrains,
} from './content3d.ts';
import { hides, type Peek, SeeIn } from './peek3d.ts';
import { Solids } from './solids3d.ts';
import { Surface } from './surface3d.ts';
import { drapeOver } from './terrain-paint.ts';
import { Terrains } from './terrain3d.ts';
import { groundDue, groundToDraw, Resolution, type Square } from './frame-budget.ts';
import { CameraInput } from './input3d.ts';
import { isFigure, Models, type ModelShown } from './models3d.ts';
import { eyeOf, follow, groundSquare, type MapPoint, ORBIT, type Orbit, panBy, rotateBy, zoomBy } from './orbit.ts';
import { type FlatMap, PixiBridge } from './pixi-bridge.ts';
import { at3d, Backdrop, Ground, hazeOf, Standees, type Standing, Walls } from './scene3d.ts';
import { cutaway, wallBoxes } from './walls3d.ts';

// The map in 3D, with a camera like Baldur's Gate 3's (orbit.ts): the 2D map
// still draws the ground, light and fog and takes the clicks (pixi-bridge.ts);
// this view lays that picture on the floor shown, stands the walls up to the
// ceiling and the creatures on their spots, and follows the creature you act
// with. The map view (MapView) hands itself over while it is on.

/** What the 3D view needs of the 2D map. */
export interface Map2D extends FlatMap {
  readonly tokens: Pick<TokenLayer, 'placeOf' | 'showFaces'>;
}

const FOV = 45;
/** Walls on the camera's side of the target are cut down this close to it (squares), to this many pixels. */
const CUT = { radius: 9, low: 14 };
/** How often the walls are worked out again when nothing says they changed, seconds. */
const WALLS_EVERY = 0.25;

export class View3D {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private pmrem = new THREE.PMREMGenerator(this.renderer);
  private litBy?: THREE.Texture;
  /** What creatures stand on: terrain, model floors and boxes, reached 6 ft up from their feet. */
  private underfoot = new Surface(
    () => this.solidsHit(),
    () => 6 * this.px(),
  );
  private surfacesSeen = '';
  /** BG3's look inside: the roof and near walls round your creature fade while it is under a roof. */
  private seeIn = new SeeIn(() => [this.models.group, this.solids.group]);
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 5, 200000);
  private surface = document.createElement('div');
  private ground: Ground;
  private walls = new Walls();
  private standees = new Standees();
  private models = new Models();
  private solids = new Solids();
  private tileSolids: SolidShown[] = [];
  private terrains = new Terrains();
  private tileTerrains: TerrainShown[] = [];
  private backdrop = new Backdrop();
  /** The model tiles to stand, worked out with the walls. */
  private tileModels: ModelShown[] = [];
  private floorShown?: number;
  private bridge: PixiBridge;
  private input: CameraInput;
  private hemi = new THREE.HemisphereLight(0xfff4e0, 0x403830, 1.2);
  private sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private orbit: Orbit;
  /** The square the 2D map drew last, which the ground shows now, and the one it was asked for since. */
  private drawn?: Square;
  private asked?: Square;
  private sinceDrawn = 0;
  /** Something on the 2D map may have changed (the pointer moved, a creature walks): draw it again soon. */
  private poked = true;
  private walkersSeen = '';
  /** Drops the 3D picture's resolution while frames are slow. */
  private resolution = new Resolution();
  private following = true;
  private followed?: string;
  private wallsDue = 0;
  private wallsDirty = true;
  private ray = new THREE.Raycaster();
  /** The left button is down: a drag (a creature carried, a marquee) looks through creatures to the ground. */
  private held = false;
  private off: (() => void)[] = [];
  private tick = () => this.frame(this.map.app.ticker.deltaMS / 1000);

  constructor(
    private readonly map: Map2D,
    private readonly host: HTMLElement,
    private readonly session: Session,
  ) {
    const start = map.cam.center;
    this.orbit = { target: [start[0], start[1], this.floor()], yaw: 0, distance: 14 * this.grid(), tactical: false };
    this.ground = new Ground(map.app.canvas);
    this.bridge = new PixiBridge(map, (x, y) => this.pick(x, y));
    this.input = new CameraInput(this.surface, {
      zoom: (n) => (this.orbit = zoomBy(this.orbit, n, this.grid())),
      turn: (r) => (this.orbit = rotateBy(this.orbit, r)),
      pan: (by) => this.pan(by),
      tactical: () => (this.orbit = { ...this.orbit, tactical: !this.orbit.tactical }),
      centre: () => (this.following = true),
      toggle: () => session.view3d.toggle(),
    });
    this.scene.add(
      this.ground.mesh,
      this.walls.group,
      this.standees.group,
      this.models.group,
      this.solids.group,
      this.terrains.group,
      this.backdrop.table,
    );
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  start(): void {
    this.surface.className = 'view3d';
    this.surface.style.cssText = 'position:absolute;inset:0;';
    this.surface.dataset.testid = 'view3d';
    this.sharpness();
    // As 3D Canvas renders, so imported scenes keep their light.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.surface.appendChild(this.renderer.domElement);
    this.host.appendChild(this.surface);
    // The 3D canvas itself, not the box round it: Pixi takes a release over
    // anything but its target element for one outside the map, and drops nothing.
    this.bridge.attach(this.renderer.domElement);
    // Actors and the rest dragged in from the side panel land under the pointer.
    listenToDrops(this.surface, this.session, (x, y) => {
      const r = this.surface.getBoundingClientRect();
      return this.pick(x + r.left, y + r.top);
    });
    this.map.tokens.showFaces(false);
    this.watchHeld();
    const dirty = () => (this.wallsDirty = true);
    this.off.push(
      this.session.on('chunk', dirty),
      this.session.on('chunkGone', dirty),
      this.session.on('fog', dirty),
      this.session.on('editor', dirty),
      this.session.on('select', () => (this.following = true)),
    );
    const poke = () => (this.poked = true);
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel']) {
      this.surface.addEventListener(type, poke, { passive: true });
      this.off.push(() => this.surface.removeEventListener(type, poke));
    }
    // After the 2D map has drawn the frame (its render runs at LOW priority).
    this.map.app.ticker.add(this.tick, undefined, -50);
  }

  /** Notes the left button going down after the 2D map took the press, and up after it took the release. */
  private watchHeld(): void {
    const down = (e: PointerEvent) => (this.held ||= e.button === 0);
    const up = () => (this.held = false);
    this.surface.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    this.off.push(() => window.removeEventListener('pointerup', up));
  }

  destroy(): void {
    this.map.app.ticker.remove(this.tick);
    for (const off of this.off) off();
    this.input.dispose();
    this.bridge.detach(this.host);
    this.map.tokens.showFaces(true);
    this.surface.remove();
    this.ground.dispose();
    this.solids.dispose();
    this.terrains.dispose();
    this.walls.dispose();
    this.standees.dispose();
    this.backdrop.dispose();
    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }

  /** The screen's resolution (at most 2 pixels a point), lowered while frames are slow. */
  private sharpness(): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * this.resolution.scale);
  }

  private grid(): number {
    return this.session.world?.gridSize ?? 100;
  }

  /** Pixels per foot. */
  private px(): number {
    return this.grid() / 5;
  }

  /** The level shown, and its floor's height in pixels. */
  private level() {
    const levels = this.session.world?.levels;
    const id = this.session.levels.current;
    return levels?.find((l) => l.id === id) ?? (levels?.length ? levelAt(levels, 0) : undefined);
  }

  private floor(): number {
    return (this.level()?.bottom ?? 0) * this.px();
  }

  /** The height the 2D map's picture lies at: the lowest floor it draws (the street), pixels. */
  private street(): number {
    const lowest = this.session.levels.shown?.[0];
    const level = this.session.world?.levels?.find((l) => l.id === lowest);
    return level ? level.bottom * this.px() : this.floor();
  }

  private frame(dt: number): void {
    if (!this.session.world) return;
    this.input.tick(dt);
    this.followCreature(dt);
    const floor = this.floor();
    const [x, y] = this.orbit.target;
    // On terrain the camera looks at the ground under it, not the bare floor.
    this.orbit = { ...this.orbit, target: [x, y, Math.max(floor, this.terrains.heightAt(x, y) ?? floor)] };
    this.layGround(dt);
    this.fitView();
    this.askGround();
    this.placeCamera();
    this.wallsDue -= dt;
    if (this.wallsDirty || this.wallsDue <= 0) this.standWalls(floor);
    const standing = this.standing();
    this.pokeIfWalking(standing);
    this.standees.show(standing, floor);
    this.seeIn.update(this.acting(standing, floor), this.orbit.yaw, { px: this.px(), grid: this.grid() });
    this.standModels(floor);
    this.renderer.render(this.scene, this.camera);
  }

  /** The 2D map has drawn the square asked for last: lay that picture down (the ground follows the floor every frame). */
  private layGround(dt: number): void {
    this.sinceDrawn += dt;
    const fresh = this.bridge.takeDrawn();
    if (fresh && this.asked) {
      this.drawn = this.asked;
      this.sinceDrawn = 0;
    }
    if (!this.drawn) return;
    this.ground.show(this.drawn.center, this.drawn.half, this.street(), fresh);
    drapeOver(this.ground.picture, this.drawn.center, this.drawn.half);
  }

  /** Asks the 2D map for a new square when the camera leaves the one drawn, else again only when something changed. */
  private askGround(): void {
    const need = groundSquare(this.orbit, { fov: FOV, aspect: this.camera.aspect, grid: this.grid() });
    const next = groundToDraw(need, this.asked);
    if (next) {
      this.bridge.frame(next.center, next.half);
      this.asked = next;
    } else if (groundDue({ sinceDrawn: this.sinceDrawn, poked: this.poked })) this.bridge.redraw();
    this.poked = false;
  }

  /** A creature walking moves its ring on the 2D map: the ground is drawn again while it does. */
  private pokeIfWalking(standing: readonly Standing[]): void {
    const seen = standing.map((s) => `${s.at[0]},${s.at[1]}`).join(';');
    if (seen !== this.walkersSeen) this.poked = true;
    this.walkersSeen = seen;
  }

  private fitView(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (this.resolution.frame(this.map.app.ticker.deltaMS)) this.sharpness();
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** The camera from the orbit; light and fog by the scene's darkness. */
  private placeCamera(): void {
    const eye = eyeOf(this.orbit, this.grid());
    const t = this.orbit.target;
    this.camera.position.set(eye[0], eye[2], eye[1]);
    this.camera.lookAt(t[0], t[2], t[1]);
    const world = this.session.world!;
    const light = 1 - 0.8 * world.darkness;
    this.hemi.intensity = 1.2 * light;
    this.sun.intensity = 1.4 * light;
    this.sun.position.set(t[0] - 2000, t[2] + 4000, t[1] - 1500);
    this.sun.target.position.set(t[0], t[2], t[1]);
    const background = world.background ?? '#1b1d22';
    const v = world.view3d;
    const look = { sky: v?.sky, ground: v?.ground ?? background, background, ...(v?.fog && { fog: v.fog }) };
    this.backdrop.show(this.scene, look, this.floor());
    const reach = ORBIT.maxReach * this.grid();
    this.scene.fog = hazeOf(look, this.grid(), [this.orbit.distance + reach * 0.4, this.orbit.distance + reach * 1.1]);
    this.skyLight(this.backdrop.skyPicture);
  }

  /** The sky lights the scene as 3D Canvas lets it (its picture as the environment), once it has loaded. */
  private skyLight(sky: THREE.Texture | undefined): void {
    const ready = sky?.image ? sky : undefined;
    if (ready === this.litBy) return;
    this.litBy = ready;
    this.scene.environment?.dispose();
    this.scene.environment = ready ? this.pmrem.fromEquirectangular(ready).texture : null;
  }

  /** The camera keeps up with the creature you act with, until you move it yourself. */
  private followCreature(dt: number): void {
    const id = this.session.selected;
    if (id !== this.followed) {
      this.followed = id;
      this.following = true;
    }
    const place = id && this.following ? this.map.tokens.placeOf(id) : undefined;
    if (!place) return;
    const goal: MapPoint = [place.at[0], place.at[1], this.orbit.target[2]];
    this.orbit = follow(this.orbit, goal, dt);
  }

  /** A right drag moves the camera over the ground, as far as the ground under the pointer moved. */
  private pan(by: Point): void {
    this.following = false;
    const perPixel = (2 * this.orbit.distance * Math.tan((FOV * Math.PI) / 360)) / Math.max(1, this.host.clientHeight);
    this.orbit = panBy(this.orbit, [-by[0] * perPixel, -by[1] * perPixel]);
  }

  /** What is on the table, on every floor (the world stands whole, as in BG3), as far as you have explored. */
  private table(): Table3D {
    const fog = this.session.isGm() || !this.session.world?.vision ? undefined : this.session.fog.shown();
    return {
      world: this.session.world!,
      ...(fog && { explored: (p: Point) => fog.explored(p) }),
    };
  }

  /** Stands the walls (unless the scene's models are its walls) and works out the model tiles. */
  private standWalls(floor: number): void {
    this.wallsDirty = false;
    this.wallsDue = WALLS_EVERY;
    const level = this.level();
    const current = this.session.levels.current;
    const table = this.table();
    const chunks = [...this.session.chunks.values()];
    const tiles = chunks.flatMap((c) => c.tiles);
    this.tileModels = tileModels(tiles, table);
    this.tileSolids = tileSolids(tiles, table);
    this.tileTerrains = tileTerrains(tiles, table);
    const walls =
      table.world.view3d?.walls === false ? [] : chunks.flatMap((c) => c.walls.filter((w) => onLevel(w, current)));
    const boxes = wallBoxes(walls, {
      bottom: level?.bottom ?? 0,
      top: level?.top,
      grid: this.grid(),
      explored: table.explored,
    });
    const t = this.orbit.target;
    const cut = { target: [t[0], t[1]] as Point, yaw: this.orbit.yaw, radius: CUT.radius * this.grid(), low: CUT.low };
    this.walls.show(this.orbit.tactical ? boxes : cutaway(boxes, cut), floor);
  }

  /** The model tiles, and the creatures that have a figure; all stood again when the floor shown changes. */
  private standModels(floor: number): void {
    if (this.floorShown !== floor) {
      this.models.restand();
      this.solids.restand();
      this.terrains.restand();
    }
    this.floorShown = floor;
    const placeOf = (id: string) => this.map.tokens.placeOf(id);
    const all = [...this.tileModels, ...figures(this.session.tokens.values(), this.table(), placeOf)];
    const ground = { grid: this.grid(), feet: 5, floor: this.level()?.bottom ?? 0 };
    this.models.show(all, ground, floor);
    this.models.cull(this.camera.position, this.grid());
    const hover = this.session.inspect.hover;
    this.models.glow(hover?.kind === 'tile' ? `tile:${hover.id}` : undefined);
    this.solids.show(this.tileSolids, ground, floor);
    this.terrains.show(this.tileTerrains, ground, floor);
    const seen = `${this.models.stood}:${this.solids.count}:${this.terrains.count}:${floor}`;
    if (seen !== this.surfacesSeen) {
      this.underfoot.forget();
      this.seeIn.forget();
    }
    this.surfacesSeen = seen;
    this.surface.dataset.models = String(this.models.count);
    this.surface.dataset.solids = String(this.solids.count);
    this.surface.dataset.terrain = String(this.terrains.count);
  }

  /** The creatures you see on the floors shown (but those with a figure), where the 2D map has them now. */
  private standing(): Standing[] {
    const table = this.table();
    const floor = this.floor();
    const out: Standing[] = [];
    for (const t of this.session.tokens.values()) {
      const place = this.map.tokens.placeOf(t.id);
      if (!place || t.model || !onShownFloor(t, table)) continue;
      // On its own floor, wherever the floor shown is.
      const feet = Math.max(t.elevation ?? 0, levelOf(this.session.world?.levels, t)?.bottom ?? -Infinity) * this.px();
      out.push({
        id: t.id,
        at: place.at,
        height: (this.underfoot.under(t.id, place.at, feet) ?? feet) - floor,
        size: t.size * this.grid(),
        picture: portraitOf(t),
        faint: t.hidden,
      });
    }
    return out;
  }

  /** The creature you act with, where it stands (none from above, the tactical view). */
  private acting(standing: readonly Standing[], floor: number) {
    const id = this.session.selected;
    const stood = standing.find((s) => s.id === id);
    if (!stood || this.orbit.tactical) return undefined;
    return { id: stood.id, at: stood.at, feet: floor + stood.height };
  }

  /** What the pointer and creatures' feet meet: terrain, the model tiles and the boxes. */
  private solidsHit(): THREE.Object3D[] {
    return [...this.terrains.meshes, this.models.group, this.solids.group];
  }

  /** The map point under the pointer: a creature's spot when it is their picture, else the floor. */
  private pick(clientX: number, clientY: number): Point {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    const token = this.held ? undefined : this.standees.hit(this.ray);
    const place = token ? this.map.tokens.placeOf(token) : undefined;
    if (place) return place.at;
    const ground = this.ray
      .intersectObjects(this.solidsHit(), true)
      .find((h) => pointable(h, this.seeIn.peek, this.held))?.point;
    if (ground) return [ground.x, ground.z];
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.floor());
    const hit = this.ray.ray.intersectPlane(floor, new THREE.Vector3());
    if (hit) return [hit.x, hit.z];
    const t = this.orbit.target;
    const far = at3d([t[0], t[1]], t[2]).add(this.ray.ray.direction.clone().setY(0).normalize().multiplyScalar(1e5));
    return [far.x, far.z];
  }
}

/** What the pointer may land on: shown, not faded to see in, and no creature's figure while dragging. */
function pointable(hit: THREE.Intersection, peek: Peek | undefined, held: boolean): boolean {
  if (!hit.object.visible || hides(peek, hit.point.toArray())) return false;
  return !held || !isFigure(hit.object);
}

/** The level a creature stands on. */
function levelOf(levels: WorldInfo['levels'], t: Parameters<typeof tokenLevel>[1]) {
  const id = tokenLevel(levels, t);
  return levels?.find((l) => l.id === id);
}
