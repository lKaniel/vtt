import { inArea, isLinked, scaledSpell, type Spell, tokenDistance } from '@vtt/system-dnd5e';
import { gridKind, type Point } from '@vtt/shared';
import { Refusal, type Fighter, type Table } from './table.ts';

// Who and where a spell is aimed at: the creatures picked (in range, in
// sight), the creatures in its area, or a point it reaches.

/** What the caster aimed with. */
export interface Aim {
  slot: number;
  targets: string[];
  point?: Point;
}

export class SpellTargets {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  private get grid() {
    return this.store.world.gridSize;
  }

  targets(caster: Fighter, spell: Spell, req: Aim, canSee: (id: string) => boolean): Fighter[] {
    if (spell.teleport || spell.summon || spell.door) {
      const point = spell.door && req.point ? this.doorSide(caster, req.point) : req.point;
      this.checkPoint(caster, spell, point, spell.teleport ?? spell.range);
      return [];
    }
    if (spell.area) return this.areaTargets(caster, spell, req.point);
    const scaled = scaledSpell(spell, req.slot, caster.sheet.caster?.level ?? 1);
    if (scaled.targets === 0) return [this.table.fighter(caster.token.id)];
    return this.picked(caster, spell, req, { most: scaled.beams > 1 ? scaled.beams : scaled.targets, canSee });
  }

  /** The creatures picked, at most `most`; none, at a point, casts it at empty ground, where it hits no one. */
  private picked(
    caster: Fighter,
    spell: Spell,
    req: Aim,
    { most, canSee }: { most: number; canSee: (id: string) => boolean },
  ): Fighter[] {
    if (!req.targets.length && req.point) return this.atGround(caster, spell, req.point);
    if (!req.targets.length) throw new Refusal(`Pick a target for ${spell.name}`);
    if (req.targets.length > most) throw new Refusal(`${spell.name} can target at most ${most}`);
    return req.targets.map((id) => this.creatureTarget(caster, spell, id, canSee));
  }

  private creatureTarget(caster: Fighter, spell: Spell, id: string, canSee: (id: string) => boolean): Fighter {
    const token = this.store.tokens.get(id);
    if (spell.linkedOnly && token && isLinked(token, caster.token.id)) return this.table.fighter(id);
    if (!canSee(id)) throw new Refusal('No such target');
    const target = this.table.fighter(id);
    if (spell.linkedOnly) throw new Refusal(`${target.token.name} isn't linked to ${caster.token.name}`);
    const feet = tokenDistance(caster.token, target.token, this.grid, gridKind(this.store.world));
    if (feet > Math.max(5, spell.range)) throw new Refusal(`${target.token.name} is out of range (${feet} ft)`);
    if (!this.table.clearShot([caster.token.x, caster.token.y], [target.token.x, target.token.y])) {
      throw new Refusal(`${caster.token.name} has no clear path to ${target.token.name}`);
    }
    return target;
  }

  private atGround(caster: Fighter, spell: Spell, point: Point): Fighter[] {
    this.checkPoint(caster, spell, point, spell.range);
    return [];
  }

  /** A door is aimed at on its wall: the caster needs to see the near side of it. */
  private doorSide({ token }: Fighter, [x, y]: Point): Point {
    const d = Math.hypot(token.x - x, token.y - y) || 1;
    const step = Math.min(d, this.grid / 4);
    return [x + ((token.x - x) / d) * step, y + ((token.y - y) / d) * step];
  }

  private checkPoint(caster: Fighter, spell: Spell, point: Point | undefined, range: number): Point {
    if (!point) throw new Refusal(`Pick a point for ${spell.name}`);
    const from: Point = [caster.token.x, caster.token.y];
    const feet = (Math.hypot(point[0] - from[0], point[1] - from[1]) / this.grid) * 5;
    if (range > 0 && feet > range + 2.5) throw new Refusal(`That point is out of range (${Math.round(feet)} ft)`);
    if (!this.table.clearShot(from, point)) throw new Refusal(`${caster.token.name} can't see that point`);
    return point;
  }

  /** Every creature in the area that the area's origin has a clear line to. */
  private areaTargets(caster: Fighter, spell: Spell, point: Point | undefined): Fighter[] {
    const aim =
      spell.range > 0
        ? this.checkPoint(caster, spell, point, spell.range)
        : (point ?? [caster.token.x + 1, caster.token.y]);
    const origin: Point = spell.area!.shape === 'sphere' || spell.range > 0 ? aim : [caster.token.x, caster.token.y];
    const area = { area: spell.area!, range: spell.range };
    return [...this.store.tokens.values()]
      .filter((t) => inArea(area, { caster: caster.token, aim, token: t, gridSize: this.grid }))
      .filter((t) => this.table.clearShot(origin, [t.x, t.y]))
      .flatMap((t) => {
        const sheet = this.table.sheetOf(t);
        return sheet ? [{ token: t, sheet }] : [];
      });
  }
}
