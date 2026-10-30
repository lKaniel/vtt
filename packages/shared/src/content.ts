import { z } from 'zod';
import items from '../content/srd/items.json' with { type: 'json' };
import monsters from '../content/srd/monsters.json' with { type: 'json' };
import { ItemSchema, MonsterSchema, type Item, type Monster } from './stats-schema.ts';

/** Everything a token can refer to by id. */
export interface Content {
  items: ReadonlyMap<string, Item>;
  monsters: ReadonlyMap<string, Monster>;
}

function byId<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((x) => [x.id, x]));
}

/** The bundled SRD 5.2 content (CC-BY-4.0), validated on load. */
export const srd: Content = {
  items: byId(z.array(ItemSchema).parse(items)),
  monsters: byId(z.array(MonsterSchema).parse(monsters)),
};
