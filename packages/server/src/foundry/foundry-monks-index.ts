import type { MediaLookup } from './foundry-scene.ts';
import type { FoundryDoc } from './foundry-db.ts';
import { originOf } from './foundry-origin.ts';
import type { segmentsOf } from './foundry-monks-flow.ts';
import type { TriggerTarget } from '@vtt/shared';

// What Monk's Active Tiles actions point at, found among a converted
// scene's things (by Tagger tag, Foundry id or "this tile"), and the
// lookups the converters share (foundry-active-tiles.ts and the rest).

/** Where a converted thing came from, to find it again by Foundry id or tag. */
interface Indexed {
  target: Target;
  raw: FoundryDoc;
  id?: string;
  tags: string[];
}

export interface Target {
  coll: TriggerTarget['coll'] | 'walls';
  id: string;
}

/** Our scene's things, found by what Monk's actions call them. */
export class SceneIndex {
  private readonly items: Indexed[] = [];

  /** Adds a list of converted things (made by the import, so their Foundry documents are known). */
  add(coll: Target['coll'], list: readonly { id: string }[]): this {
    for (const item of list) {
      const raw = originOf(item);
      if (!raw) continue;
      const tags = (raw.flags as { tagger?: { tags?: unknown } } | undefined)?.tagger?.tags;
      const id = typeof raw._id === 'string' ? raw._id : undefined;
      this.items.push({ target: { coll, id: item.id }, raw, id, tags: Array.isArray(tags) ? tags.map(String) : [] });
    }
    return this;
  }

  /** Our things for a Monk's entity: "tagger:<tag>[, tag]" ({#} any number), a Foundry uuid or id. */
  // fallow-ignore-next-line unused-class-member -- targets() calls it through TriggerLookups.index
  find(entity: string, colls?: readonly Target['coll'][]): Target[] {
    const ok = (x: Indexed) => !colls || colls.includes(x.target.coll);
    if (entity.startsWith('tagger:')) {
      const patterns = entity.slice(7).split(',').map(tagPattern);
      return this.items
        .filter((x) => ok(x) && x.tags.some((t) => patterns.some((p) => p.test(t))))
        .map((x) => x.target);
    }
    const id = entity.split('.').pop();
    return this.items.filter((x) => ok(x) && x.id === id).map((x) => x.target);
  }

  /** The Foundry document a converted thing came from. */
  rawOf(target: Target): FoundryDoc | undefined {
    return this.items.find((x) => x.target.coll === target.coll && x.target.id === target.id)?.raw;
  }
}

const tagPattern = (tag: string) =>
  new RegExp(
    `^${tag
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{#\\\}/g, '\\d+')}$`,
  );

export interface TriggerLookups {
  index: SceneIndex;
  media: MediaLookup;
  /** Every file a Foundry pattern with `*` names (in the Data folder). */
  glob: (pattern: string) => string[];
  /** Our scene id for a Foundry scene id. */
  scene: (foundryId: string) => string | undefined;
  /** The pictures Monk's cycles a tile through, by our tile id. */
  imagesOf: (tile: string) => string[];
  /** The scene's floor at an elevation (feet); none on a scene without floors. */
  floorAt?: (feet: number) => string | undefined;
  /** Our journal entry and page ids for Foundry's. */
  entry?: (foundryId: string) => string | undefined;
  page?: (foundryId: string) => string | undefined;
  /** The scene's square, pixels (for Monk's distances in squares). */
  gridSize?: number;
}

/** The tile itself, the creature that set it off, or what the entity names. */
export type Entity = string | undefined;

export const entityOf = (d: Record<string, unknown> | undefined): Entity => {
  const e = d?.entity;
  if (typeof e === 'string') return e;
  const id = (e as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' ? id : undefined;
};

export interface ActionContext extends TriggerLookups {
  /** Our id of the tile the trigger is on. */
  self: string;
  /** The trigger's landings, for a dialog's buttons to jump to. */
  segments: ReturnType<typeof segmentsOf>;
}

export function targets(entity: Entity, c: ActionContext, colls?: readonly Target['coll'][]): Target[] {
  if (!entity || entity === 'tile') return !colls || colls.includes('tiles') ? [{ coll: 'tiles', id: c.self }] : [];
  if (entity === 'token' || entity === 'players' || entity === 'within') return [];
  return c.index.find(entity, colls);
}
