import type { Op } from '@vtt/core';
import { withChoice, type ZoneHit, zonePlacements, zonesOf } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// Lights and walls lasting spells put on the map (darkness, wall of force):
// after every step the scene's spell-made lights and walls are brought in line
// with the zones, like their templates (zone-templates.ts), and go with them.

const PREFIX = 'zone-';
type Fields = Record<string, unknown>;

export class ZonePlacing {
  constructor(private table: Table) {}

  sync(): void {
    const store = this.table.store;
    const want = { lights: new Map<string, Fields>(), walls: new Map<string, Fields>() };
    for (const z of zonesOf(store.tokens.values())) this.wanted(z, want);
    const ops = [...this.match('lights', 'light', want.lights), ...this.match('walls', 'wall', want.walls)];
    if (ops.length) store.applyOps(ops);
  }

  /** What one zone puts on the map, keyed by the document ids it uses. */
  private wanted(z: ZoneHit, want: { lights: Map<string, Fields>; walls: Map<string, Fields> }): void {
    const known = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    const spell = known && withChoice(known, z.effect.zone.choice);
    if (!spell?.places) return;
    const placed = zonePlacements(z, spell, this.table.store.world.gridSize);
    const id = `${PREFIX}${z.effect.id}`;
    if (placed.light) want.lights.set(id, placed.light);
    placed.walls.forEach((w, i) => want.walls.set(`${id}-${i + 1}`, { ...w, ...placed.rules }));
  }

  /** Ops that make the scene's spell-made documents in `coll` exactly `want`. */
  private match(coll: string, type: string, want: Map<string, Fields>): Op[] {
    const store = this.table.store;
    const at = `${store.currentScene}/${coll}`;
    const ops: Op[] = [];
    for (const doc of store.docs.all(at)) {
      if (!doc.id.startsWith(PREFIX)) continue;
      const fields = want.get(doc.id);
      if (!fields) ops.push({ op: 'delete', coll: at, id: doc.id });
      else if (Object.entries(fields).some(([k, v]) => JSON.stringify(doc[k]) !== JSON.stringify(v))) {
        ops.push({ op: 'update', coll: at, id: doc.id, patch: fields });
      }
      want.delete(doc.id);
    }
    for (const [id, fields] of want) {
      ops.push({ op: 'create', coll: at, doc: { id, type, rev: 0, ...fields } });
    }
    return ops;
  }
}
