import { inZone, type Token, type ZoneHit, zonesOf } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';
import type { SpellActions } from './spell-actions.ts';
import type { Table } from './table.ts';

/**
 * Lasting areas in a fight: a creature that starts its turn in one, or walks
 * into one, is hit by its spell, at most once per zone each turn.
 */
export class Zones {
  private hit = new Set<string>();

  constructor(
    private table: Table,
    private spells: SpellActions,
  ) {}

  private get store() {
    return this.table.store;
  }

  /** A creature's turn starts: zones it stands in hit it. */
  turnStarted(id: string): void {
    const token = this.store.tokens.get(id);
    if (!token) return;
    for (const z of zonesOf(this.store.tokens.values())) {
      if (this.contains(z, token, [token.x, token.y])) this.trigger(z, token);
    }
  }

  /** A creature walked along `path`: zones it entered on the way hit it. */
  moved(id: string, path: readonly Point[]): void {
    const token = this.store.tokens.get(id);
    if (!token || !this.store.combat || path.length < 2) return;
    for (const z of zonesOf(this.store.tokens.values())) {
      const entered = !this.contains(z, token, path[0]!) && path.slice(1).some((p) => this.contains(z, token, p));
      if (entered) this.trigger(z, token);
    }
  }

  private contains(z: ZoneHit, token: Token, at: Point): boolean {
    const spell = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    return !!spell?.area && inZone(z, spell, { token, at, gridSize: this.store.world.gridSize });
  }

  private trigger(z: ZoneHit, victim: Token): void {
    const combat = this.store.combat;
    const spell = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    const sheet = this.table.sheetOf(victim);
    if (!combat || !spell || !sheet || sheet.hp <= 0) return;
    const key = `${combat.round}:${combat.turn}:${z.effect.id}:${victim.id}`;
    if (this.hit.has(key)) return;
    this.hit.add(key);
    this.spells.strike(
      z.bearer.id,
      { spell, slot: z.effect.zone.slot },
      [{ token: victim, sheet }],
      [`${victim.name} is caught in ${spell.name}`],
    );
  }
}
