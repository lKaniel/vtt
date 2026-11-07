import { srdFor } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { itemFacts, itemNote } from './item-facts.ts';
import { itemTip } from './tooltip.ts';

const item = (id: string, rules: '2014' | '2024' = '2014') => srdFor(rules).items.get(id)!;

describe('what an item does, in a few words', () => {
  it('names a magic weapon’s bonus and its extra damage', () => {
    expect(itemFacts(item('longsword-plus-2'))).toContain('+2 to attack and damage');
    expect(itemFacts(item('flame-tongue-longsword'))).toContain('+2d6 fire on a hit');
    expect(itemFacts(item('dragon-slayer-longsword'))).toContain('+3d6 weapon against dragon');
  });

  it('names what worn items change and what potions do', () => {
    expect(itemFacts(item('belt-of-hill-giant-strength'))).toEqual(['Needs attunement', 'STR at least 21']);
    expect(itemFacts(item('ring-of-resistance-fire'))).toContain('Resists fire');
    expect(itemFacts(item('cloak-of-elvenkind'))).toContain('Advantage on stealth');
    expect(itemFacts(item('potion-of-heroism'))).toEqual([
      '10 temporary hit points',
      '+1d4 to attacks',
      '+1d4 to saves',
      'for 1 hour',
    ]);
  });

  it('names the spells an item casts, what each costs and its charges', () => {
    const wand = itemFacts(item('wand-of-fireballs'));
    expect(wand).toContain('Casts Fireball: 1 charge at 3rd, 1 more per level above');
    expect(wand).toContain('7 charges, regains 1d6+1 at dawn');
    expect(wand).toContain('Save DC 15');
  });

  it('puts the facts in the tooltip, with what the GM runs by hand', () => {
    const tip = itemTip(item('ring-of-protection'), 'ring-of-protection', true);
    expect(tip.facts).toEqual(expect.arrayContaining(['+1 AC', '+1 to saving throws']));
    expect(tip.subtitle).toBe('Rare ring · equipped');
    expect(itemNote({ ...item('rope'), gmNote: 'Knots.' })).toBe('Knots.');
  });
});
