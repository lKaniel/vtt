import { describe, expect, it } from 'vitest';
import { type Content, srdFor } from './content.ts';
import type { Item } from './item-schema.ts';

// Every magic item either does something the engine runs, or says what the
// GM runs by hand (`manual`), like the spell audit.

const DOES = ['effect', 'bonus', 'plus', 'hitDamage', 'use', 'container', 'casts', 'manual'];
const CHANGED = ['ac', 'stealthDisadvantage', 'strength', 'damage'];

function runs(item: Item, content: Content): boolean {
  const a = item as Item & Record<string, unknown>;
  if (DOES.some((k) => a[k] !== undefined && !(Array.isArray(a[k]) && !a[k].length))) return true;
  const base =
    typeof a.base === 'string' ? (content.items.get(a.base) as Record<string, unknown> | undefined) : undefined;
  return !!base && CHANGED.some((k) => JSON.stringify(base[k]) !== JSON.stringify(a[k]));
}

describe.each(['2014', '2024'] as const)('the %s magic items', (edition) => {
  const content = srdFor(edition);
  const magic = [...content.items.values()].filter((i) => i.magic === true || i.rarity !== undefined);

  it('all do something, or say what the GM runs', () => {
    expect(magic.filter((i) => !runs(i, content)).map((i) => i.id)).toEqual([]);
  });

  it('only cast spells the game knows', () => {
    const unknown = magic.flatMap((i) =>
      (i.casts ?? []).filter((c) => !content.spells.get(c.spell)).map((c) => `${i.id}: ${c.spell}`),
    );
    expect(unknown).toEqual([]);
  });

  it('wear mithral without a strength requirement', () => {
    expect(content.items.get('mithral-armor-plate')).toMatchObject({ stealthDisadvantage: false });
    expect((content.items.get('mithral-armor-plate') as { strength?: number }).strength).toBeUndefined();
  });

  it('give a vicious weapon the GM’s note on a critical hit', () => {
    const vicious = content.items.get(edition === '2014' ? 'vicious-weapon-longsword' : 'sword-of-sharpness-longsword');
    expect(vicious?.manual?.why).toBeTruthy();
  });
});
