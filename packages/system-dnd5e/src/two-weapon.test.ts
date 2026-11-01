import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { TokenSchema } from './token-schema.ts';
import type { Edition } from './stats-schema.ts';
import { offHandCost, offHandProblem } from './two-weapon.ts';

const fighter = (items: string[], rules: Edition = '2014', dex = 16) =>
  resolveCreature(
    TokenSchema.parse({
      id: 'f',
      name: 'F',
      x: 50,
      y: 50,
      stats: { class: 'fighter', level: 3, rules, abilities: { dex, str: Math.min(dex, 10) } },
      inventory: items.map((item) => ({ item, equipped: true })),
    }),
    srdFor(rules),
  )!;

describe('two-weapon fighting', () => {
  it('gives an off-hand attack without the ability modifier when wielding two light weapons', () => {
    const sheet = fighter(['shortsword', 'dagger']);
    const off = sheet.attacks.filter((a) => a.offHand);
    expect(off.map((a) => [a.name, a.damage[0]!.dice])).toEqual([
      ['Shortsword (off-hand)', '1d6'],
      ['Dagger (off-hand)', '1d4'],
    ]);
    expect(fighter(['shortsword']).attacks.some((a) => a.offHand)).toBe(false);
    expect(fighter(['shortsword', 'longsword']).attacks.some((a) => a.offHand)).toBe(false);
  });

  it('keeps a negative modifier', () => {
    const sheet = fighter(['shortsword', 'shortsword'], '2014', 8);
    expect(sheet.attacks.find((a) => a.offHand)!.damage[0]!.dice).toBe('1d6-1');
  });

  it('needs a light-weapon attack first, and costs the bonus action unless the weapon has nick (2024)', () => {
    const sheet = fighter(['shortsword', 'scimitar'], '2024');
    const off = (name: string) => sheet.attacks.find((a) => a.name === `${name} (off-hand)`)!;
    expect(offHandProblem([])).toMatch(/light weapon first/);
    expect(offHandProblem(['light-attack'])).toBeUndefined();
    expect(offHandCost(sheet, off('Scimitar'), [])).toBe('free');
    expect(offHandCost(sheet, off('Scimitar'), ['nick'])).toBe('bonus');
    expect(offHandCost(sheet, off('Shortsword'), [])).toBe('bonus');
    const old = fighter(['shortsword', 'scimitar'], '2014');
    expect(
      offHandCost(
        old,
        old.attacks.find((a) => a.name === 'Scimitar (off-hand)')!,
        [],
      ),
    ).toBe('bonus');
  });
});
