import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import {
  attunedCount,
  attuneProblem,
  carriedWeight,
  carryingCapacity,
  coinWeight,
  dropEntry,
  containerLoad,
  encumbrance,
  inventoryIssues,
  putInside,
  totalGp,
} from './carrying.ts';
import { MAX_ATTUNED } from './stats-schema.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const token = (data: object) =>
  TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, stats: { abilities: { str: 10 } }, ...data });

describe('coins', () => {
  it('weigh a pound per fifty and add up in gold', () => {
    expect(coinWeight({ gp: 100, sp: 50 })).toBe(3);
    expect(coinWeight(undefined)).toBe(0);
    expect(totalGp({ pp: 1, gp: 2, ep: 2, sp: 5, cp: 30 })).toBeCloseTo(13.8);
  });
});

describe('carrying capacity', () => {
  it('is Strength × 15, doubled per size above medium and halved for tiny', () => {
    expect(carryingCapacity(10, 1)).toBe(150);
    expect(carryingCapacity(18, 2)).toBe(540);
    expect(carryingCapacity(10, 3)).toBe(600);
    expect(carryingCapacity(10, 0.5)).toBe(75);
  });
});

describe('carried weight', () => {
  it('counts gear by quantity and coins', () => {
    const t = token({ inventory: [{ item: 'longsword' }, { item: 'torch', qty: 4 }], currency: { gp: 50 } });
    expect(carriedWeight(t, book)).toBe(3 + 4 + 1);
  });

  it("leaves out what's in a bag of holding but counts the bag", () => {
    const t = token({
      inventory: [
        { id: 'boh', item: 'bag-of-holding' },
        { item: 'plate', in: 'boh' },
        { id: 'pack', item: 'backpack' },
        { item: 'rope', in: 'pack' },
      ],
    });
    expect(carriedWeight(t, book)).toBe(15 + 5 + 5);
    expect(containerLoad(t, 'boh', book)).toBe(65);
    expect(containerLoad(t, 'pack', book)).toBe(5);
  });
});

describe('encumbrance', () => {
  it('drops speed to 5 ft over capacity', () => {
    const light = token({ inventory: [{ item: 'longsword' }] });
    expect(encumbrance(light, 10, book)).toMatchObject({ weight: 3, capacity: 150, over: false });
    const heavy = token({ inventory: [{ item: 'plate', qty: 3 }], stats: { abilities: { str: 8 } } });
    expect(encumbrance(heavy, 8, book).over).toBe(true);
    expect(resolveCreature(heavy, book)?.speed).toBe(5);
    expect(resolveCreature(light, book)?.speed).toBe(30);
  });

  it("doesn't slow a monster down by what it carries", () => {
    const ogre = token({ monster: 'ogre', stats: undefined, inventory: [{ item: 'plate', qty: 30 }] });
    expect(resolveCreature(ogre, book)?.speed).toBe(30);
  });
});

describe('attunement', () => {
  const ring = { item: 'ring-of-protection', equipped: true };
  it('allows three attuned items at most', () => {
    const t = token({ inventory: [ring, ring, ring, ring].map((e, i) => ({ ...e, attuned: i < 3 })) });
    expect(attunedCount(t)).toBe(MAX_ATTUNED);
    expect(attuneProblem(t, 3, book)).toMatch(/three/);
    expect(attuneProblem(token({ inventory: [ring] }), 0, book)).toBeUndefined();
    expect(attuneProblem(token({ inventory: [{ item: 'longsword' }] }), 0, book)).toMatch(/attunement/);
  });

  it("gives an item's bonus only while it's attuned", () => {
    const worn = token({ inventory: [ring] });
    const attuned = token({ inventory: [{ ...ring, attuned: true }] });
    expect(resolveCreature(worn, book)?.ac).toBe(10);
    const sheet = resolveCreature(attuned, book)!;
    expect(sheet.ac).toBe(11);
    expect(sheet.saves.dex).toBe(1);
  });
});

describe('containers', () => {
  it('puts an entry inside a container, naming the container first', () => {
    const t = token({ inventory: [{ item: 'backpack' }, { item: 'rope' }] });
    const inside = putInside(t.inventory!, 1, 0);
    expect(inside[0]!.id).toBe('backpack');
    expect(inside[1]!.in).toBe('backpack');
    expect(putInside(inside, 1, undefined)[1]!.in).toBeUndefined();
  });

  it('tips out what was in a container that is taken away', () => {
    const t = token({
      inventory: [
        { id: 'pack', item: 'backpack' },
        { item: 'rope', in: 'pack' },
      ],
    });
    expect(dropEntry(t.inventory!, 0)).toEqual([{ item: 'rope', qty: 1, equipped: false }]);
  });

  it('refuses a fourth attuned item', () => {
    const ring = { item: 'ring-of-protection', attuned: true };
    expect(() => token({ inventory: [ring, ring, ring, ring] })).toThrow(/3 attuned/);
  });

  it('reports missing containers and overfull ones', () => {
    const t = token({
      inventory: [
        { item: 'rope', in: 'nowhere' },
        { id: 'p', item: 'pouch' },
        { item: 'plate', in: 'p' },
      ],
    });
    expect(inventoryIssues(t, book)).toEqual([
      'item "rope" is in "nowhere", which is not a container it carries',
      'container "p" holds 65 lb, more than its 6 lb',
    ]);
  });
});
