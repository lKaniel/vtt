import { describe, expect, it } from 'vitest';
import { compendium, crText } from './compendium.ts';

describe('the Compendium', () => {
  it('lists monsters of one edition, filtered by name', () => {
    const list = compendium('monsters', '2014', 'goblin');
    expect(list.map((e) => e.name)).toEqual(['Goblin', 'Hobgoblin']);
    expect(list[0]).toMatchObject({ sub: 'CR 1/4 humanoid', drag: { kind: 'monster', id: 'goblin', rules: '2014' } });
    expect(compendium('monsters', '2024', 'goblin boss')[0]!.drag).toEqual({
      kind: 'monster',
      id: 'goblin-boss',
      rules: '2024',
    });
  });

  it('describes weapons, armour and spells', () => {
    expect(compendium('weapons', '2014', 'longsword')[0]).toMatchObject({
      sub: 'Martial melee · 1d8 slashing',
      drag: { kind: 'item', id: 'longsword' },
    });
    expect(compendium('armor', '2014', 'chain mail')[0]!.sub).toBe('Heavy armour · AC 16');
    expect(compendium('spells', '2014', 'fireball')[0]).toMatchObject({
      sub: '3rd-level evocation',
      drag: { kind: 'spell', id: 'fireball', rules: '2014' },
    });
    expect(compendium('spells', '2014', 'fire bolt')[0]!.sub).toBe('Evocation cantrip');
  });

  it('lists class features with their class and level, keyed by both', () => {
    const rage = compendium('features', '2014', 'rage');
    expect(rage[0]).toMatchObject({
      key: 'barbarian/rage',
      name: 'Rage',
      sub: 'Barbarian 1',
      drag: { kind: 'feature', id: 'rage', class: 'barbarian', rules: '2014' },
    });
    const keys = compendium('features', '2014', '').map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(compendium('features', '2014', 'unarmored defense').map((e) => e.sub)).toEqual(['Barbarian 1', 'Monk 1']);
  });

  it('writes fractional challenge ratings the usual way', () => {
    expect([0, 0.125, 0.25, 0.5, 3].map(crText)).toEqual(['0', '1/8', '1/4', '1/2', '3']);
  });
});
