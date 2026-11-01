import type { Doc, Op } from '@vtt/core';
import type { Template } from '@vtt/shared';
import { type ZoneHit, zonesOf, zoneTemplate } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// Lasting zones show as templates on the map. After every step the templates
// are brought in line with the zones: one per zone, following a caster it is
// attached to, gone when the spell is. The GM may move one; the zone is then
// where its template is.

const idOf = (z: ZoneHit) => `zone-${z.effect.id}`;
type Owner = NonNullable<Template['effect']>;

export class ZoneTemplates {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  private get coll(): string {
    return `${this.store.currentScene}/templates`;
  }

  /** The template a zone shows as, if it has one. */
  of(z: ZoneHit): Template | undefined {
    return this.store.docs.get(this.coll, idOf(z)) as unknown as Template | undefined;
  }

  /** Puts in, takes out and moves templates so they match the zones on this scene. */
  sync(): void {
    const zones = new Map(zonesOf(this.store.tokens.values()).map((z) => [idOf(z), z]));
    const ops: Op[] = [];
    for (const doc of this.store.docs.all(this.coll)) {
      const owner = doc.effect as Owner | undefined;
      if (!owner?.id) continue;
      const zone = zones.get(doc.id);
      if (zone?.effect.id !== owner.id) ops.push({ op: 'delete', coll: this.coll, id: doc.id });
      else ops.push(...this.follow(doc, zone));
      zones.delete(doc.id);
    }
    for (const z of zones.values()) ops.push(...this.create(z));
    if (ops.length) this.store.applyOps(ops);
  }

  private create(z: ZoneHit): Op[] {
    const spell = this.table.content(z.bearer).spells.get(z.effect.zone.spell);
    const shape = spell && zoneTemplate(z, spell);
    if (!shape) return [];
    const effect: Owner = { token: z.bearer.id, id: z.effect.id };
    const doc = { id: idOf(z), type: 'template', rev: 0, ...shape, effect } as Doc;
    return [{ op: 'create', coll: this.coll, doc }];
  }

  /** An attached template moves with its token. */
  private follow(doc: Doc, z: ZoneHit): Op[] {
    if (doc.attachedTo !== z.bearer.id) return [];
    if (doc.x === z.bearer.x && doc.y === z.bearer.y) return [];
    return [{ op: 'update', coll: this.coll, id: doc.id, patch: { x: z.bearer.x, y: z.bearer.y } }];
  }
}
