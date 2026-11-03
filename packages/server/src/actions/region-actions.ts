import {
  canObserve,
  levelChoices,
  onLevel,
  type Player,
  tokenLevel,
  fogCell,
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
import { springTrap, type Token, TrapRulesSchema } from '@vtt/system-dnd5e';
import { fromDoc } from '../store/doc-sync.ts';
import { Refusal, type Table } from '../play/table.ts';
import type { TriggerActions } from './trigger-actions.ts';

// Regions at work (see regions.ts in shared): walking into one runs its
// behaviours in order. Difficult ground is the path's business (`cost`).
// A teleport ends the walk there, so later behaviours and regions wait. The
// actions a tile trigger has (teleport, message, door...) run in trigger-actions.ts.

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

  /** The working regions of the scene the store reads now. */
  private regions(): Region[] {
    const docs = this.store.docs.all(`${this.store.currentScene}/regions`);
    return docs.map((d) => fromDoc<Region>(d)).filter((r) => regionWorks(r, this.store.world.darkness));
  }

  /** What each square costs to walk into, by the difficult ground on this scene. */
  cost(): (p: Point) => number {
    return regionCost(this.regions(), this.store.world.darkness);
  }

  /** A token walked along `path`: the regions it went into, nearest first, do what they do. */
  entered(id: string, path: readonly Point[]): void {
    // Tiles to walk onto go first (trigger-actions.ts).
    if (this.triggers.entered(id, path)) return;
    const hits = regionsEntered(this.regions(), path).sort((a, b) => a.at - b.at);
    for (const { region } of hits) {
      for (const b of region.behaviors) {
        const token = this.store.tokens.get(id);
        if (!token || !this.onTokenLevel(region, token)) break;
        if (this.run(token, region, b)) return;
      }
    }
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
    if (!this.level(token, to)) throw new Refusal('No such level');
  }

  /** Runs one behaviour; true when the token was taken away (a teleport). */
  private run(token: Token, region: Region, b: RegionBehavior): boolean {
    switch (b.type) {
      case 'difficult':
        return false;
      case 'trap':
        this.trap(token, region, b);
        return false;
      case 'level':
        this.level(token, b.to);
        return false;
      case 'stairs':
        this.stairs(token, b.between);
        return false;
      case 'elevator':
        this.elevator(token, b.floors);
        return false;
      case 'reveal':
        this.reveal(token, region);
        return false;
      default:
        return this.triggers.run(b, { token });
    }
  }

  private trap(token: Token, region: Region, b: Extract<RegionBehavior, { type: 'trap' }>): void {
    if (b.once)
      this.store.applyOps([
        { op: 'update', coll: `${this.store.currentScene}/regions`, id: region.id, patch: { disabled: true } },
      ]);
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

  /** Puts the token on level `to`, at its bottom; false when the scene has no such level. */
  private level(token: Token, to: string): boolean {
    const level = this.store.world.levels?.find((l) => l.id === to);
    if (level) this.store.setToken({ ...token, elevation: level.bottom });
    return !!level;
  }

  /** Up the stairs from the lower of the two levels, down from the other. */
  private stairs(token: Token, [a, b]: readonly [string, string]): void {
    const here = this.levelOf(token);
    if (here === a) this.level(token, b);
    else if (here === b) this.level(token, a);
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
    for (const p of world.players.filter((pl) => !isGm(pl) && canObserve(token, pl))) {
      this.store.fog.explore(this.store.currentScene, p.id, cell, [raster]);
    }
  }
}
