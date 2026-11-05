import { levelAt, onLevel, type Point, type Rect } from '@vtt/shared';
import * as THREE from 'three';
import { listenToDrops } from '../canvas/sidebar-drops.ts';
import type { TokenLayer } from '../canvas/TokenLayer.ts';
import type { Session } from '../session/session.ts';
import {
  figures,
  type SolidShown,
  type Table3D,
  type TerrainShown,
  tileModels,
  tileSolids,
  tileTerrains,
} from './content3d.ts';
import { SeeIn } from './peek3d.ts';
import { Picker } from './pick3d.ts';
import { Overlay3D, type OverlayHost } from './overlay3d.ts';
import { Solids } from './solids3d.ts';
import { Surface } from './surface3d.ts';
import type { PathPreview } from '../canvas/PathPreview.ts';
import { Climbing } from './climb3d.ts';
import { Terrains } from './terrain3d.ts';
import { chunkArea, Resolution } from './frame-budget.ts';
import { GroundFeed } from './ground-feed.ts';
import { quality3d } from './quality3d.ts';
import { CameraRig } from './camera3d.ts';
import { CameraInput } from './input3d.ts';
import { Models, type ModelShown } from './models3d.ts';
import { eyeOf, groundSquare, ORBIT } from './orbit.ts';
import { levelOf, standingOf } from './standing3d.ts';
import { type FlatMap, PixiBridge } from './pixi-bridge.ts';
import { Play3D, type Play3DHost } from './play3d.ts';
import { Ground, Standees, type Standing, Walls } from './scene3d.ts';
import { Lighting } from './light3d.ts';
import { cutaway, wallBoxes } from './walls3d.ts';

// The map in 3D, with a camera like Baldur's Gate 3's (orbit.ts): the 2D map
// still draws the ground, light and fog and takes the clicks (pixi-bridge.ts);
// this view lays that picture on the floor shown, stands the walls up to the
// ceiling and the creatures on their spots, and follows the creature you act
// with. The map view (MapView) hands itself over while it is on.

/** What the 3D view needs of the 2D map. */
export interface Map2D extends FlatMap {
  readonly tokens: Pick<TokenLayer, 'placeOf' | 'showFaces' | 'release'>;
  readonly preview: OverlayHost['preview'] & Pick<PathPreview, 'route'>;
  readonly editor: { marquee(): Rect | undefined };
  readonly effects: Play3DHost['map']['effects'];
}

const FOV = 45;
/** Walls on the camera's side of the target are cut down this close to it (squares), to this many pixels. */
const CUT = { radius: 9, low: 14 };
/** How often the walls are worked out again when nothing says they changed, seconds. */
const WALLS_EVERY = 0.25;

export class View3D {
  /** How good it looks against how fast it runs (quality3d.ts); a new choice starts the view again. */
  private quality = quality3d();
  private renderer = new THREE.WebGLRenderer({
    antialias: this.quality.antialias,
    powerPreference: 'high-performance',
  });
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
  private lighting = new Lighting(this.renderer, this.scene);
  /** The model tiles to stand, worked out with the walls. */
  private tileModels: ModelShown[] = [];
  private floorShown?: number;
  private bridge: PixiBridge;
  private input: CameraInput;
  private rig: CameraRig;
  /** The ground picture from the 2D map, and when the view draws (ground-feed.ts). */
  private feed: GroundFeed;
  /** Drops the 3D picture's resolution while frames are slow. */
  private resolution = new Resolution(this.quality.lowestScale);
  /** The map whose pieces stay loaded round the camera. */
  private reach?: Rect;
  private frames = 0;
  /** The pointer's ring, the previews and the walk's marker, over the surfaces. */
  private overlay: Overlay3D;
  /** The camera has been to the scene's start since it loaded. */
  private homed = false;

  private get orbit() {
    return this.rig.orbit;
  }
  private wallsDue = 0;
  private wallsDirty = true;
  private picker = new Picker({
    camera: this.camera,
    canvas: this.renderer.domElement,
    creature: (ray) => this.standees.hit(ray),
    placeOf: (id) => this.map.tokens.placeOf(id)?.at,
    surfaces: () => this.solidsHit(),
    peek: () => this.seeIn.peek,
    floor: () => this.floor(),
    target: () => this.orbit.target,
  });
  /** Attacks and spells, lunges and flinches. */
  private play: Play3D;
  /** Walks climb what they cross: stairs, bridges, a tower's top. */
  private climbing = new Climbing({
    token: (id) => this.session.tokens.get(id),
    placeOf: (id) => this.map.tokens.placeOf(id)?.at,
    ground: (at, from, step) => this.underfoot.at(at, from, step),
    route: (id) => (this.map.preview.route?.token === id ? this.map.preview.route.points : undefined),
    px: () => this.px(),
    grid: () => this.grid(),
  });
  private off: (() => void)[] = [];
  private tick = () => this.frame(this.map.app.ticker.deltaMS / 1000);

  constructor(
    private readonly map: Map2D,
    private readonly host: HTMLElement,
    private readonly session: Session,
  ) {
    this.rig = new CameraRig({ grid: () => this.grid(), height: () => this.host.clientHeight, fov: FOV }, () => {
      const start = session.world?.start ?? map.cam.center;
      return [start[0], start[1], this.floor()];
    });
    this.play = new Play3D({
      map,
      session,
      floor: () => this.floor(),
      groundAt: ([x, y]) => this.terrains.heightAt(x, y) ?? this.floor(),
      surfaceAt: (p) => this.underfoot.at(p, this.floor(), 6 * this.px()),
      px: () => this.px(),
      grid: () => this.grid(),
      target: () => [this.orbit.target[0], this.orbit.target[1]],
      copiesOf: (key) => this.models.copiesOf(key),
    });
    this.ground = new Ground(map.app.canvas);
    this.bridge = new PixiBridge(map, (x, y) => this.pick(x, y), this.quality.groundPixels);
    this.feed = new GroundFeed(this.bridge, this.ground, {
      refresh: this.quality.groundRefresh,
      idleFps: this.quality.idleFps,
    });
    this.overlay = new Overlay3D({
      surface: this.surface,
      camera: this.camera,
      picker: this.picker,
      preview: map.preview,
      grid: () => this.grid(),
      heightAt: (x, y, from) => this.walkerGround(x, y, from),
      walker: () => (session.selected ? map.tokens.placeOf(session.selected)?.at : undefined),
      marquee: () => map.editor.marquee(),
    });
    this.input = new CameraInput(
      this.surface,
      this.rig.steer(() => session.view3d.toggle()),
    );
    this.scene.add(
      this.ground.mesh,
      this.walls.group,
      this.standees.group,
      this.models.group,
      this.solids.group,
      this.terrains.group,
      this.overlay.marks.group,
      this.play.group,
    );
  }

  start(): void {
    this.surface.className = 'view3d';
    this.surface.style.cssText = 'position:absolute;inset:0;';
    this.surface.dataset.testid = 'view3d';
    this.surface.dataset.quality = this.quality.level;
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
    this.overlay.start();
    this.play.start();
    this.session.view3d.climb = (id, to) => this.climbing.end(id, to);
    this.watchHeld();
    const dirty = () => (this.wallsDirty = true);
    this.off.push(
      this.session.on('chunk', dirty),
      this.session.on('chunkGone', dirty),
      this.session.on('fog', dirty),
      this.session.on('editor', dirty),
      this.session.on('select', () => this.rig.back()),
      // A new scene: the camera starts at its start, until it finds your creature.
      this.session.on('welcome', () => (this.homed = false)),
    );
    const poke = () => this.feed.poke();
    for (const type of ['pointermove', 'pointerdown', 'pointerup', 'wheel']) {
      this.surface.addEventListener(type, poke, { passive: true });
      this.off.push(() => this.surface.removeEventListener(type, poke));
    }
    // After the 2D map has drawn the frame (its render runs at LOW priority).
    this.map.app.ticker.add(this.tick, undefined, -50);
  }

  /** Notes the left button going down after the 2D map took the press, and up after it took the release. */
  private watchHeld(): void {
    const down = (e: PointerEvent) => (this.picker.held ||= e.button === 0);
    const up = () => (this.picker.held = false);
    this.surface.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    this.off.push(() => window.removeEventListener('pointerup', up));
  }

  destroy(): void {
    this.session.view3d.climb = undefined;
    this.map.app.ticker.remove(this.tick);
    for (const off of this.off) off();
    this.play.dispose();
    this.input.dispose();
    this.overlay.destroy();
    this.bridge.detach(this.host);
    this.map.tokens.showFaces(true);
    this.surface.remove();
    this.ground.dispose();
    this.solids.dispose();
    this.terrains.dispose();
    this.walls.dispose();
    this.standees.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
  }

  /** The screen's resolution (at most 2 pixels a point), lowered while frames are slow. */
  private sharpness(): void {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.quality.pixelRatio) * this.resolution.scale);
    this.feed.touch();
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
    if (!this.homed) this.rig.goHome();
    this.homed = true;
    this.frames++;
    this.input.tick(dt);
    const floor = this.floor();
    // On terrain the camera looks at the ground under it, not the bare floor.
    if (!this.followCreature(dt, floor))
      this.rig.settle((x, y) => Math.max(floor, this.terrains.heightAt(x, y) ?? floor));
    this.rig.keepInBounds();
    this.streamChunks();
    this.feed.lay(dt, this.street());
    this.fitView();
    this.feed.ask(groundSquare(this.orbit, { fov: FOV, aspect: this.camera.aspect, grid: this.grid() }));
    this.placeCamera();
    this.wallsDue -= dt;
    if (this.wallsDirty || this.wallsDue <= 0) this.standWalls(floor);
    const now = performance.now();
    const standing = this.standing().map((s) => this.play.pose(s, now));
    this.play.frame(standing, now);
    this.feed.walkers(standing.map((s) => s.at));
    this.standees.show(standing, floor);
    const eye = this.camera.position;
    this.seeIn.update(this.acting(standing, floor), [eye.x, eye.y, eye.z], { px: this.px(), grid: this.grid() });
    this.standModels(floor);
    this.overlay.frame(dt, this.frames);
    // The walk's marker pulses until the walker gets there.
    if (this.overlay.marks.destination.visible) this.feed.touch();
    const view = `${JSON.stringify(this.orbit)}:${this.models.stood}:${this.session.inspect.hover?.id}`;
    if (this.feed.due(view, dt)) this.renderer.render(this.scene, this.camera);
  }

  private fitView(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (this.resolution.frame(this.map.app.ticker.deltaMS)) this.sharpness();
    const size = this.renderer.getSize(new THREE.Vector2());
    if (size.x === w && size.y === h) return;
    this.renderer.setSize(w, h);
    this.feed.touch();
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  /** The camera from the orbit; light and fog by the scene's darkness. */
  private placeCamera(): void {
    const eye = eyeOf(this.orbit, this.grid());
    const t = this.orbit.target;
    this.camera.position.set(eye[0], eye[2], eye[1]);
    this.camera.lookAt(t[0], t[2], t[1]);
    const reach = ORBIT.maxReach * this.grid();
    const seen = { target: [t[0], t[2], t[1]] as const, distance: this.orbit.distance, reach, grid: this.grid() };
    this.lighting.show(this.session.world!, { ...seen, lowest: this.lowest() });
  }

  /**
   * The camera keeps with the creature you act with, turning round its feet,
   * until you move it yourself; it comes back once the creature moves. True
   * while it follows.
   */
  private followCreature(dt: number, floor: number): boolean {
    const id = this.session.selected;
    const at = id ? this.map.tokens.placeOf(id)?.at : undefined;
    const feet = id && at ? this.feetOf(id, at) : undefined;
    return this.rig.keepWith(id, at, feet ?? floor, dt);
  }

  /** Where a creature's feet stand, three's y (pixels). */
  private feetOf(id: string, at: Point): number | undefined {
    const t = this.session.tokens.get(id);
    if (!t) return undefined;
    const feet = Math.max(t.elevation ?? 0, levelOf(this.session.world?.levels, t)?.bottom ?? -Infinity) * this.px();
    return this.underfoot.under(id, at, feet) ?? feet;
  }

  /** Keeps the map's pieces loaded round the camera, not round the ground in sight, so turning drops none. */
  private streamChunks(): void {
    const world = this.session.world!;
    const t = this.orbit.target;
    const next = chunkArea([t[0], t[1]], { grid: this.grid(), chunkSize: world.chunkSize }, this.reach);
    if (!next) return;
    this.reach = next;
    this.map.chunkArea = next;
    this.map.dirty = true;
  }

  /** What the creature you act with would walk on at a map point (the floor shown with no one). */
  private walkerGround(x: number, y: number, from?: number): number {
    const id = this.session.selected;
    const at = id ? this.map.tokens.placeOf(id)?.at : undefined;
    const feet = from ?? (id && at ? this.feetOf(id, at) : undefined) ?? this.floor();
    // A step along a path climbs a stair, not a table.
    return this.underfoot.at([x, y], feet, from === undefined ? undefined : 2 * this.px());
  }

  /** The lowest floor's height (the street), pixels. */
  private lowest(): number {
    const levels = this.session.world?.levels ?? [];
    return Math.min(0, ...levels.map((l) => l.bottom)) * this.px();
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
    if (this.wallsDirty) this.feed.touch();
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
    const span = { bottom: level?.bottom ?? 0, top: level?.top, grid: this.grid(), explored: table.explored };
    const boxes = wallBoxes(walls, span);
    this.play.doors(walls, span, tiles);
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
    const now = performance.now();
    const placeOf = (id: string) => this.play.placeOf(id, now);
    const all = [...this.tileModels, ...figures(this.session.tokens.values(), this.table(), placeOf)];
    const ground = { grid: this.grid(), feet: 5, floor: this.level()?.bottom ?? 0 };
    this.models.show(all, ground, floor);
    this.models.cull(this.camera.position, this.grid(), this.quality.tiny);
    const hover = this.session.inspect.hover;
    this.models.glow(this.play.glowOf(hover));
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
    return standingOf(this.session.tokens.values(), {
      table: this.table(),
      floor: this.floor(),
      px: this.px(),
      grid: this.grid(),
      placeOf: (id) => this.map.tokens.placeOf(id),
      under: (id, at, feet) => this.underfoot.under(id, at, feet),
      walking: (id, at) => this.climbing.walking(id, at),
      stood: (id, feet, flying) => this.climbing.stood(id, feet, flying),
    });
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

  /** The map point under the pointer: a creature's spot when it is their picture, else what it is on. */
  private pick(clientX: number, clientY: number): Point {
    return this.picker.pick(clientX, clientY, this.frames).at;
  }
}
