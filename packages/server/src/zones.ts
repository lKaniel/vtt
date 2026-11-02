import { inZone, type Token, withChoice, type ZoneHit, zonesOf } from '@vtt/system-dnd5e';
import { inTemplate, isParty, type Point } from '@vtt/shared';
import type { SpellActions } from './spell-actions.ts';
import type { Table } from './table.ts';
import type { ZoneTemplates } from './zone-templates.ts';

/** The bearer, and their allies when the zone spares them. */
function spared({ bearer, effect }: ZoneHit, token: Token): boolean {
  if (token.id === bearer.id) return true;
  return effect.zone.spares === 'allies' && isParty(token) === isParty(bearer);
}

/**
 * Lasting areas in a fight: a creature that starts its turn in one, or walks
 * into one, is hit by its spell, at most once per zone each turn.
 */
export class Zones {
  private hit = new Set<string>();

  constructor(
    private table: Table,
    private spells: SpellActions,
    private templates: ZoneTemplates,
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

  /** Whether `token` standing at `at` is in the zone: in its template when it has one (the GM may have moved it). */
  private contains(z: ZoneHit, token: Token, at: Point): boolean {
    const spell = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    if (!spell?.area) return false;
    const gridSize = this.store.world.gridSize;
    const template = this.templates.of(z);
    if (!template) return inZone(z, spell, { token, at, gridSize });
    return !spared(z, token) && inTemplate(template, at, gridSize, (token.size * gridSize) / 4);
  }

  private trigger(z: ZoneHit, victim: Token): void {
    const combat = this.store.combat;
    const known = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    const spell = known && withChoice(known, z.effect.zone.choice);
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
