import { afterEach, describe, expect, it } from 'vitest';
import { compendium, crText, facetOptions } from './compendium.ts';
import { setPackContent } from './content.ts';

describe('the Compendium', () => {
  afterEach(() => setPackContent([]));

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

  it('gives every entry a picture: painted art where there is some, else a glyph', () => {
    expect(compendium('spells', '2014', 'fireball')[0]!.icon).toMatchObject({ art: '/art/icons/spells/fireball.webp' });
    expect(compendium('weapons', '2014', 'longsword')[0]!.icon.art).toBe('/art/icons/items/longsword.webp');
    expect(compendium('features', '2014', 'rage')[0]!.icon.art).toBe('/art/icons/features/rage.webp');
    const odd = compendium('features', '2014', 'timeless body')[0]!;
    expect(odd.icon.art).toBeUndefined();
    expect(odd.icon.glyph).toBeTruthy();
    // A monster without a painted token is drawn as a claw.
    expect(compendium('monsters', '2014', 'goblin')[0]!.icon).toMatchObject({ glyph: 'claw', art: undefined });
  });

  it('filters spells by level, school and class', () => {
    const third = compendium('spells', '2014', { picks: { level: '3', school: 'Evocation', class: 'Wizard' } });
    expect(third.map((e) => e.name)).toContain('Fireball');
    expect(third.map((e) => e.name)).toContain('Lightning Bolt');
    expect(third.every((e) => e.facets.level?.includes('3'))).toBe(true);
    expect(compendium('spells', '2014', { picks: { level: '3', class: 'Cleric' } }).map((e) => e.name)).not.toContain(
      'Fireball',
    );
  });

  it('filters monsters by challenge rating and creature type, and sorts by CR', () => {
    const list = compendium('monsters', '2014', { picks: { type: 'Dragon' }, sort: 'order' });
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((e) => e.facets.type?.[0] === 'Dragon')).toBe(true);
    const crs = list.map((e) => e.order);
    expect(crs).toEqual([...crs].sort((a, b) => a - b));
    expect(compendium('monsters', '2014', { picks: { cr: '0.25' } }).map((e) => e.name)).toContain('Goblin');
  });

  it('offers the values each filter can take, in order, with how many entries have them', () => {
    const levels = facetOptions('spells', '2014', 'level');
    expect(levels.map((o) => o.value)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(levels.every((o) => o.count > 0)).toBe(true);
    const crs = facetOptions('monsters', '2014', 'cr').map((o) => o.value);
    expect(crs.slice(0, 4)).toEqual(['0', '0.125', '0.25', '0.5']);
    expect(facetOptions('armor', '2014', 'category').map((o) => o.value)).toEqual([
      'Heavy',
      'Light',
      'Medium',
      'Shield',
    ]);
  });

  it('searches beyond names: a school, a creature type or a damage type finds entries', () => {
    expect(compendium('spells', '2014', 'necromancy').map((e) => e.name)).toContain('Animate Dead');
    const fire = compendium('spells', '2014', 'fire');
    // Names first, then the rest.
    expect(fire[0]!.name.toLowerCase()).toContain('fire');
  });

  it('searches every book at once, telling the kinds apart', () => {
    const all = compendium('all', '2014', 'shield');
    const kinds = new Set(all.map((e) => e.facets.kind?.[0]));
    expect(kinds).toEqual(new Set(['Armour', 'Gear', 'Spell', 'Monster']));
    expect(compendium('all', '2014', { query: 'shield', picks: { kind: 'Spell' } }).map((e) => e.name)).toContain(
      'Shield',
    );
  });

  it("names where an entry comes from: the SRD or one of the game's packs", () => {
    setPackContent([
      {
        id: 'beasts',
        name: 'Swamp beasts',
        type: 'monster',
        path: 'beasts.json',
        pack: 'swamp',
        docs: [
          {
            ...{ id: 'bog-hound', name: 'Bog Hound', ac: 12, hp: 11, cr: 0.5, type: 'beast', abilities: ABILITIES },
            img: 'pack://swamp/hound.webp',
          },
        ],
      },
    ]);
    const hound = compendium('monsters', '2014', 'bog hound')[0]!;
    expect(hound.source).toBe('Swamp beasts');
    expect(hound.icon.art).toBe('/packs/swamp/hound.webp');
    expect(compendium('monsters', '2014', 'goblin')[0]!.source).toBe('SRD');
    expect(facetOptions('monsters', '2014', 'source').map((o) => o.value)).toEqual(['SRD', 'Swamp beasts']);
    expect(compendium('monsters', '2014', { picks: { source: 'Swamp beasts' } }).map((e) => e.name)).toEqual([
      'Bog Hound',
    ]);
  });
});

const ABILITIES = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
