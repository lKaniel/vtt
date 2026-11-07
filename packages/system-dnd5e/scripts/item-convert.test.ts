import { describe, expect, it } from 'vitest';
import fixture from './fixtures/srd-items.json' with { type: 'json' };
import items51 from '../content/srd/items-5.1.json' with { type: 'json' };
import items52 from '../content/srd/items-5.2.json' with { type: 'json' };
import { convertItems } from './item-convert.ts';
import type { Entry, Pack } from './srd-convert.ts';

// The item converter run over a slice of the SRD packs (every weapon and
// armor, some gear and a spread of magic items): it gives what the
// generated items-5.x.json files hold.

const pack = (v: '5.1' | '5.2'): Pack => ({
  entries: new Map((fixture[v].entries as Entry[]).map((e) => [e.id, e])),
  text: fixture[v].text,
});
type Out = Record<string, unknown> & { id: string };
const convert = (v: '5.1' | '5.2') => convertItems(pack(v), new Set(['spell-scroll'])).items as Out[];
const byId = (list: readonly Out[]) => new Map(list.map((i) => [i.id, i]));
const generated = { '5.1': byId(items51), '5.2': byId(items52 as Out[]) };

/** The fields the hand text adds (descriptions are not in the slice). */
const bare = (item: Out | undefined) => JSON.stringify({ ...item, description: undefined });

describe.each(['5.1', '5.2'] as const)('converting the SRD %s items', (v) => {
  const items = convert(v);
  const out = byId(items);

  it('matches the generated file for every item it converts', () => {
    const differ = items.filter((i) => bare(i) !== bare(generated[v].get(i.id)));
    expect(differ.map((i) => i.id)).toEqual([]);
  });

  it('makes a variant of a template for each base it fits', () => {
    expect(out.get('longsword-plus-1')).toMatchObject({ type: 'weapon', plus: 1, base: 'longsword' });
    expect(out.get('flame-tongue-longsword')).toMatchObject({ hitDamage: [{ dice: '2d6', type: 'fire' }] });
    expect(out.get('mithral-armor-plate')).toMatchObject({ stealthDisadvantage: false });
    expect(out.get('mithral-armor-plate')).not.toHaveProperty('strength');
  });

  it('keeps the ids older worlds carry, and leaves out the hand-written ones', () => {
    expect(out.get('lantern-hooded') ?? out.get('rope')).toBeDefined();
    expect(out.has('spell-scroll')).toBe(false);
  });

  it('reads what wands and staffs cast and what each costs', () => {
    expect(out.get('wand-of-fireballs')).toMatchObject({
      casts: [{ spell: 'fireball', cost: 'level', less: 2 }],
      charges: { max: 7 },
    });
    expect((out.get('staff-of-healing') as { casts?: object[] }).casts?.length).toBeGreaterThan(1);
  });

  it('reads worn effects, potions and books', () => {
    expect(out.get('ring-of-protection')).toMatchObject({ effect: { ac: 1 }, bonus: { saves: 1 } });
    expect(out.get('cloak-of-elvenkind')).toMatchObject({ effect: { checkAdvantageFor: ['stealth'] } });
    expect(out.get('potion-of-heroism')).toMatchObject({ use: { potion: true, tempHp: 10 } });
    expect(out.get('manual-of-bodily-health')).toMatchObject({ use: { raise: { ability: 'con', by: 2 } } });
  });
});
