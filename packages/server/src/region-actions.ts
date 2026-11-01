import {
  canControl,
  canObserve,
  fogCell,
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
import { fromDoc } from './doc-sync.ts';
import { moveSeats, sceneOf } from './scene-actions.ts';
import type { Table } from './table.ts';

// Regions at work (see regions.ts in shared): walking into one runs its
// behaviours in order. Difficult ground is the path's business (`cost`).
// A teleport ends the walk there, so later behaviours and regions wait.

type Say = (text: string, gmOnly: boolean) => void;

type Step = (token: Token, region: Region, b: RegionBehavior) => boolean | undefined;

export class RegionActions {
  constructor(
    private table: Table,
    private say: Say,
  ) {}

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
    const hits = regionsEntered(this.regions(), path).sort((a, b) => a.at - b.at);
    for (const { region } of hits) {
      for (const b of region.behaviors) {
        const token = this.store.tokens.get(id);
        if (!token || this.run(token, region, b)) return;
      }
    }
  }

  /** Runs one behaviour; true when the token was taken away (a teleport). */
  private run(token: Token, region: Region, b: RegionBehavior): boolean {
    const steps: Record<RegionBehavior['type'], Step> = {
      difficult: () => false,
      trap: (t, r, trap) => {
        this.trap(t, r, trap as Extract<RegionBehavior, { type: 'trap' }>);
        return false;
      },
      teleport: (t, _r, tp) => this.teleport(t, tp as Extract<RegionBehavior, { type: 'teleport' }>),
      level: (t, _r, l) => {
        this.level(t, (l as Extract<RegionBehavior, { type: 'level' }>).to);
        return false;
      },
      reveal: (t, r) => {
        this.reveal(t, r);
        return false;
      },
      message: (_t, _r, m) => {
        const msg = m as Extract<RegionBehavior, { type: 'message' }>;
        this.say(msg.text, !!msg.gmOnly);
        return false;
      },
    };
    return steps[b.type](token, region, b) === true;
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
      if (b.message) this.say(b.message, false);
      return;
    }
    const sprung = springTrap(sheet, rules.data, this.table.rng, this.table.rng);
    if (sprung.damage > 0) this.table.hurt(token, { hp: sprung.hp, tempHp: sprung.tempHp }, sprung.damage);
    this.say(`${lead}${token.name}: ${sprung.text}`.trim(), false);
  }

  private teleport(token: Token, b: Extract<RegionBehavior, { type: 'teleport' }>): boolean {
    const here = this.store.currentScene;
    const [x, y] = b.to;
    if (!b.scene || b.scene === here) {
      this.store.setToken({ ...token, x, y });
      return true;
    }
    if (!this.store.hasScene(b.scene)) return false;
    const doc = this.store.docs.get(`${here}/tokens`, token.id)!;
    this.store.applyOps([
      { op: 'delete', coll: `${here}/tokens`, id: token.id },
      { op: 'create', coll: `${b.scene}/tokens`, doc: { ...doc, x, y } },
    ]);
    const owners = this.store.world.players.filter(
      (p) => !isGm(p) && canControl(token, p) && sceneOf(p, this.store) === here,
    );
    moveSeats(
      this.store,
      owners.map((p) => p.id),
      b.scene,
    );
    return true;
  }

  private level(token: Token, to: string): void {
    const level = this.store.world.levels?.find((l) => l.id === to);
    if (level) this.store.setToken({ ...token, elevation: level.bottom });
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
