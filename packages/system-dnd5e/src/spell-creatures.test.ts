import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { spellCreature, summonCount } from './spell-creatures.ts';
import { TokenSchema } from './token-schema.ts';

// Creatures whose stat block comes with the spell (2024 giant insect, summon
// dragon, find steed, animate objects): built for the slot and the caster.

const option = (edition: '2014' | '2024', spell: string, id: string) =>
  srdFor(edition)
    .spells.get(spell)!
    .summon!.options.find((o) => o.monster === id)!;
const caster = { attack: 7, mod: 4 };

describe('a spell’s own stat block', () => {
  it('giant insect: AC and hit points grow with the slot, attacks use the caster’s bonus', () => {
    const spider = spellCreature(option('2024', 'giant-insect', 'insect-spider'), { slot: 6, level: 4, ...caster })!;
    expect(spider).toMatchObject({ id: 'insect-spider', ac: 17, hp: 50, size: 2, type: 'beast', multiattack: 3 });
    expect(spider.attacks.map((a) => [a.name, a.toHit, a.damage[0]!.dice])).toEqual([
      ['Poison Jab', 7, '1d6+3+6'],
      ['Web Bolt', 7, '1d10+3+6'],
    ]);
    expect(spider.attacks[0]!.damage[1]).toEqual({ dice: '1d4', type: 'poison' });
  });

  it('summon dragon at its own level', () => {
    const dragon = spellCreature(option('2024', 'summon-dragon', 'draconic-spirit'), { slot: 5, level: 5, ...caster })!;
    expect(dragon).toMatchObject({ ac: 19, hp: 50, multiattack: 2, type: 'dragon' });
    expect(dragon.resistances).toContain('fire');
  });

  it('a large animated object adds the caster’s modifier and a die per slot above 5th', () => {
    const large = spellCreature(option('2024', 'animate-objects', 'object-large'), { slot: 7, level: 5, ...caster })!;
    expect(large).toMatchObject({ ac: 15, hp: 20 });
    expect(large.attacks[0]!.damage[0]!.dice).toBe('2d6+3+4+2d6');
  });

  it('2014 animated objects keep their own attack bonus', () => {
    const tiny = spellCreature(option('2014', 'animate-objects', 'object-tiny'), { slot: 5, level: 5, ...caster })!;
    expect(tiny).toMatchObject({ ac: 18, hp: 20 });
    expect(tiny.attacks[0]).toMatchObject({ toHit: 8 });
  });

  it('counts by the caster’s modifier, and more with a higher slot', () => {
    expect(summonCount(option('2024', 'animate-objects', 'object-large'), { slot: 5, level: 5, ...caster })).toBe(2);
    expect(summonCount(option('2014', 'animate-objects', 'object-tiny'), { slot: 7, level: 5, ...caster })).toBe(14);
    expect(summonCount(option('2014', 'animate-objects', 'object-medium'), { slot: 7, level: 5, ...caster })).toBe(7);
  });

  it('a summoned creature reads its stat block from the token, multiattack included', () => {
    const wasp = spellCreature(option('2024', 'giant-insect', 'insect-wasp'), { slot: 4, level: 4, ...caster })!;
    const token = TokenSchema.parse({ id: 'w', name: 'Wasp', x: 0, y: 0, monster: wasp.id, own: { monsters: [wasp] } });
    expect(resolveCreature(token, srdFor('2024'))).toMatchObject({ ac: 15, maxHp: 30, attacksPerAction: 2 });
  });
});
