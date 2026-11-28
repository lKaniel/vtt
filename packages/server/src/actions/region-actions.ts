import {
  canObserve,
  homeOf,
  laidDocs,
  levelBelow,
  levelChoices,
  onLevel,
  type Player,
  tokenLevel,
  fogCell,
  fogFloor,
  inRegion,
  isGm,
  type Point,
  rasterize,
  type Region,
  type RegionBehavior,
  regionCost,
  regionsEntered,
  regionWorks,
} from '@vtt/shared';
import { fallRules, springTrap, type Token, TrapRulesSchema } from '@vtt/system-dnd5e';
import { fogPlace } from '../store/fog-store.ts';
import { fromDoc } from '../store/doc-sync.ts';
import { Refusal, type Table } from '../play/table.ts';
import type { TriggerActions, TriggerContext } from './trigger-actions.ts';

// Regions at work (see regions.ts in shared): walking into one runs its
// behaviours in order. Difficult ground is the path's business (`cost`).
// A teleport or a fall ends the walk there, so later behaviours and regions wait. The
// actions a tile trigger has (teleport, message, door...) run in trigger-actions.ts.

/** Behaviours that take a creature to another floor where its walk ends. */
const FLOOR_WAYS = new Set<RegionBehavior['type']>(['level', 'stairs', 'elevator']);

/** A region as it lies on the scene: on a combined scene, maybe one of a part. */
type Laid = Region & { part?: string };

export class RegionActions {
  constructor(
    private table: Table,
    private triggers: TriggerActions,
  ) {}

  private get out() {
    return this.triggers.out;
  }

  private say(text: string): void {
    this.triggers.run({ type: 'message', text }, {});
  }

  private get store() {
    return this.table.store;
  }

  /** The working regions of the scene the store reads now, its parts' where they lie. */
  private regions(): Laid[] {
    const scene = { id: this.store.currentScene, parts: this.store.parts };
    const all = (coll: string) => this.store.docs.all(coll).map((d) => fromDoc<Laid>(d));
    return laidDocs(scene, 'regions', all).filter((r) => regionWorks(r, this.store.world.darkness));
  }

  /** What each square costs to walk into, by the difficult ground on this scene. */
  cost(): (p: Point) => number {
    return regionCost(this.regions(), this.store.world.darkness);
  }

  /**
   * A token walked along `path`: the regions it went into, nearest first, do
   * what they do. Stairs, lifts and the like work where the walk ends (walking
   * past them keeps you on your floor); a hole drops you where you stepped in.
   */
  entered(id: string, path: readonly Point[]): void {
    // Tiles to walk onto go first (trigger-actions.ts).
    if (this.triggers.entered(id, path)) return;
    const hits = regionsEntered(this.regions(), path).sort((a, b) => a.at - b.at);
    const end = path.at(-1)!;
    for (const { region, at } of hits) {
      if (this.runRegion(id, region, path[at]!, inRegion(region, end))) return;
    }
  }

  /** Runs a region's behaviours for a token that stepped in at `at` (`stays`: and ended its walk there); true when it was taken away. */
  private runRegion(id: string, region: Laid, at: Point, stays: boolean): boolean {
    for (const b of region.behaviors) {
      const token = this.store.tokens.get(id);
      if (!token || !this.onTokenLevel(region, token)) return false;
      if (FLOOR_WAYS.has(b.type) && !stays) continue;
      if (this.run(token, region, b, at)) return true;
    }
    return false;
  }

  /** The level a token stands on, on a scene with levels. */
  private levelOf(token: Token): string | undefined {
    return tokenLevel(this.store.world.levels, token);
  }

  /** A region on other floors than the token's does nothing for it. */
  private onTokenLevel(region: Region, token: Token): boolean {
    return onLevel(region, this.levelOf(token));
  }

  /**
   * Someone who moves `token` picked a level for it: one an elevator it
   * stands in serves (the GM may take any token to any level).
   */
  changeLevel(player: Player, token: Token, to: string): void {
    const offered = (b: RegionBehavior) => b.type === 'elevator' && (!b.floors?.length || b.floors.includes(to));
    const inLift = this.regions().some(
      (r) => this.onTokenLevel(r, token) && inRegion(r, [token.x, token.y]) && r.behaviors.some(offered),
    );
    if (!isGm(player) && !inLift) throw new Refusal('There is no way to that level here');
    if (!this.triggers.toLevel(token, to)) throw new Refusal('No such level');
  }

  /** Runs one behaviour (`at`: where the token stepped in); true when the token was taken away (a teleport, a fall). */
  private run(token: Token, region: Laid, b: RegionBehavior, at: Point): boolean {
    switch (b.type) {
      case 'difficult':
        return false;
      case 'trap':
        this.trap(token, region, b);
        return false;
      case 'elevator':
        this.elevator(token, b.floors);
        return false;
      case 'fall':
        return this.fall(token, b, at);
      case 'reveal':
        this.reveal(token, region);
        return false;
      default:
        return this.triggers.run(b, this.ctx(token, region));
    }
  }

  /** What a region's actions run with: the creature, and on a combined scene the part the region is of. */
  private ctx(token: Token, region: Laid): TriggerContext {
    const part = this.triggers.partOf(region.part);
    return { token, ...(part && { part }) };
  }

  private trap(token: Token, region: Laid, b: Extract<RegionBehavior, { type: 'trap' }>): void {
    const home = homeOf(this.store.currentScene, region);
    if (b.once)
      this.store.applyOps([{ op: 'update', coll: `${home.scene}/regions`, id: home.id, patch: { disabled: true } }]);
    const rules = TrapRulesSchema.safeParse(b.system ?? {});
    const sheet = this.table.sheetOf(token);
    const lead = b.message ? `${b.message} ` : '';
    if (!rules.success || !sheet) {
      if (b.message) this.say(b.message);
      return;
    }
    const sprung = springTrap(sheet, rules.data, this.table.rng, this.table.rng);
    if (sprung.damage > 0) this.table.hurt(token, { hp: sprung.hp, tempHp: sprung.tempHp }, sprung.damage);
    this.say(`${lead}${token.name}: ${sprung.text}`.trim());
  }

  /** Through a hole: down to `to` (or the floor below), where the token stepped in, hurt by the drop when the hole says so. */
  private fall(token: Token, b: Extract<RegionBehavior, { type: 'fall' }>, [x, y]: Point): boolean {
    const levels = this.store.world.levels;
    const to = b.to ? levels?.find((l) => l.id === b.to) : levelBelow(levels, this.levelOf(token));
    if (!to) return false;
    const drop = (token.elevation ?? 0) - to.bottom;
    this.store.setToken({ ...token, x, y, elevation: to.bottom });
    const rules = b.damage ? fallRules(drop) : undefined;
    const fallen = this.store.tokens.get(token.id)!;
    const sheet = rules && this.table.sheetOf(fallen);
    if (!rules || !sheet) {
      this.say(`${token.name} falls ${drop} ft.`);
      return true;
    }
    const hit = springTrap(sheet, rules, this.table.rng, this.table.rng);
    if (hit.damage > 0) this.table.hurt(fallen, { hp: hit.hp, tempHp: hit.tempHp }, hit.damage);
    this.say(`${token.name} falls ${drop} ft: ${hit.text}`);
    return true;
  }

  /** Asks whoever moves the token which of the elevator's floors to go to. */
  private elevator(token: Token, floors: readonly string[] | undefined): void {
    const levels = levelChoices(this.store.world.levels, floors, this.levelOf(token)).map((l) => l.id);
    if (levels.length) this.out.ask(token, { t: 'levelChoice', token: token.id, levels });
  }

  private reveal(token: Token, region: Region): void {
    const world = this.store.world;
    if (!world.vision) return;
    const cell = fogCell(world.gridSize);
    const raster = rasterize(region.points.flat(), cell);
    const place = fogPlace(this.store.currentScene, fogFloor(world.levels, this.levelOf(token)));
    for (const p of world.players.filter((pl) => !isGm(pl) && canObserve(token, pl))) {
      this.store.fog.explore(place, p.id, cell, [raster]);
    }
  }
}
