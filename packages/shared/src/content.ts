import { z } from 'zod';
import items from '../content/srd/items.json' with { type: 'json' };
import monsters51 from '../content/srd/monsters-5.1.json' with { type: 'json' };
import monsters52 from '../content/srd/monsters-5.2.json' with { type: 'json' };
import type { Token, World } from './schema.ts';
import { ItemSchema, MonsterSchema, type Edition, type Item, type Monster } from './stats-schema.ts';

/** Everything a token can refer to by id, for one rules edition. */
export interface Content {
  items: ReadonlyMap<string, Item>;
  monsters: ReadonlyMap<string, Monster>;
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

const sharedItems = byId(z.array(ItemSchema).parse(items));
const monsterList = z.array(MonsterSchema);

/** The bundled SRD content (CC-BY-4.0), validated on load: 5.1 for 2014, 5.2 for 2024. */
const SRD: Record<Edition, Content> = {
  '2014': { items: sharedItems, monsters: byId(monsterList.parse(monsters51)) },
  '2024': { items: sharedItems, monsters: byId(monsterList.parse(monsters52)) },
};

export function srdFor(edition: Edition): Content {
  return SRD[edition];
}

/** The edition a token plays by: its own `stats.rules`, else the world's. */
export function editionOf(token: Token, world: Pick<World, 'rules'>): Edition {
  return token.stats?.rules ?? world.rules;
}
