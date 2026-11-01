import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { blankOwn, changeOwn, dropOwn, makeOwn, withOwn } from './own-content.ts';
import { FeatureSchema, SpellSchema } from './spell-schema.ts';
import { ItemSchema } from './stats-schema.ts';
import { TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const hero = TokenSchema.parse({
  id: 'hero',
  name: 'Hero',
  x: 0,
  y: 0,
  stats: { class: 'wizard', level: 3, spells: ['fire-bolt'] },
  own: {
    items: [
      {
        type: 'weapon',
        id: 'sun-blade-of-amar',
        name: 'Sun Blade of Amar',
        category: 'martial',
        kind: 'melee',
        damage: { dice: '1d8', type: 'radiant' },
      },
    ],
    spells: [
      { id: 'amars-glare', name: "Amar's Glare", level: 1, school: 'evocation', castingTime: 'action', range: 60 },
    ],
    features: [{ id: 'sun-touched', name: 'Sun-touched', description: 'Bright light follows you.', uses: [[1, 2]] }],
  },
  inventory: [{ item: 'sun-blade-of-amar', qty: 1, equipped: true }],
});

describe("a sheet's own items, spells and features", () => {
  it('joins the content the sheet is read with, without changing the shared books', () => {
    const mine = withOwn(book, hero);
    expect(mine.items.get('sun-blade-of-amar')?.name).toBe('Sun Blade of Amar');
    expect(mine.spells.get('amars-glare')?.level).toBe(1);
    expect(mine.items.get('longsword')).toBe(book.items.get('longsword'));
    expect(book.items.has('sun-blade-of-amar')).toBe(false);
    expect(withOwn(book, { ...hero, own: undefined })).toBe(book);
  });

  it('makes the creature: own weapons attack, own spells are known, own features are granted', () => {
    const sheet = resolveCreature(hero, book)!;
    expect(sheet.attacks.map((a) => a.name)).toContain('Sun Blade of Amar');
    expect(sheet.caster?.spells.map((s) => s.id)).toEqual(['fire-bolt', 'amars-glare']);
    expect(sheet.features.find((f) => f.id === 'sun-touched')).toMatchObject({ max: 2, left: 2 });
  });

  it('starts blank ones with an id free on the sheet', () => {
    expect(blankOwn('item', hero)).toMatchObject({ type: 'gear', id: 'new-item', name: 'New item' });
    const taken = { ...hero, own: { items: [blankOwn('item', hero)] } };
    expect(blankOwn('item', taken).id).toBe('new-item-2');
    expect(blankOwn('spell', hero)).toMatchObject({ id: 'new-spell', level: 0, castingTime: 'action' });
    expect(blankOwn('feature', hero)).toMatchObject({ id: 'new-feature', name: 'New feature' });
    // Complete, as their schemas would read them back: an editor can use every field.
    expect(blankOwn('spell', hero)).toEqual(SpellSchema.parse(blankOwn('spell', hero)));
    expect(blankOwn('item', hero)).toEqual(ItemSchema.parse(blankOwn('item', hero)));
    expect(blankOwn('feature', hero)).toEqual(FeatureSchema.parse(blankOwn('feature', hero)));
  });
});

describe('making, changing and dropping own entries', () => {
  const bare = TokenSchema.parse({ id: 'b', name: 'B', x: 0, y: 0, stats: {} });

  it('makes a blank one; a new item also goes in the bag', () => {
    const { sheet, id } = makeOwn(bare, 'item');
    expect(id).toBe('new-item');
    expect(sheet.own?.items?.map((i) => i.id)).toEqual(['new-item']);
    expect(sheet.inventory).toEqual([{ item: 'new-item', qty: 1, equipped: false }]);
    const spell = makeOwn(sheet, 'spell');
    expect(spell.sheet.own?.spells?.[0]?.id).toBe('new-spell');
    expect(spell.sheet.own?.items).toHaveLength(1);
  });

  it('changes one in place, by id', () => {
    const { sheet } = makeOwn(bare, 'feature');
    const renamed = changeOwn(sheet, 'feature', { ...sheet.own!.features![0]!, name: 'Lucky' });
    expect(renamed.own?.features?.map((f) => f.name)).toEqual(['Lucky']);
  });

  it('drops one, and an item leaves the bag with it', () => {
    const made = makeOwn(makeOwn(bare, 'item').sheet, 'item').sheet;
    const left = dropOwn(made, 'item', 'new-item');
    expect(left.own?.items?.map((i) => i.id)).toEqual(['new-item-2']);
    expect(left.inventory?.map((e) => e.item)).toEqual(['new-item-2']);
    expect(dropOwn(dropOwn(left, 'item', 'new-item-2'), 'item', 'x').own).toBeUndefined();
  });
});
