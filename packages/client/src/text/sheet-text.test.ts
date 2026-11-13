import { describe, expect, it } from 'vitest';
import { contentWith, gameCompendia, resolveCreature, srdFor, TokenSchema } from '@vtt/system-dnd5e';
import { featureSections, inventorySections, matches, skillRows, spellColumns, xpProgress } from './sheet-text.ts';

const book = srdFor('2014');
const rogue = TokenSchema.parse({
  id: 'r',
  name: 'Rogue',
  x: 0,
  y: 0,
  stats: { class: 'rogue', level: 5, xp: 7000, abilities: { dex: 16, wis: 14 }, skills: ['stealth'] },
  inventory: [
    { item: 'dagger', equipped: true },
    { item: 'leather', equipped: true },
    { item: 'potion-of-healing', qty: 2 },
    { id: 'pack', item: 'backpack' },
    { item: 'rope', in: 'pack' },
    { item: 'torch' },
  ],
});
const sheet = resolveCreature(rogue, book)!;

describe('the skills list', () => {
  it('has all 18 skills by name, with the bonus, proficiency and passive score', () => {
    const rows = skillRows(rogue, sheet);
    expect(rows).toHaveLength(18);
    expect(rows[0]?.name).toBe('Acrobatics');
    expect(rows.find((r) => r.skill === 'stealth')).toMatchObject({ ability: 'dex', bonus: 6, proficient: true });
    expect(rows.find((r) => r.skill === 'perception')).toMatchObject({ bonus: 2, passive: 12, proficient: false });
  });

  it("lists the game's own skills after the 18, with their ability", () => {
    const psychic = { id: 'psychic-resistance', kind: 'skill', name: 'Psychic Resistance', ability: 'wis' };
    const content = contentWith('2014', gameCompendia({}, [], [psychic]));
    const trained = { ...rogue, stats: { ...rogue.stats, skills: ['psychic-resistance'] } };
    const rows = skillRows(trained, sheet, content);
    expect(rows).toHaveLength(19);
    // Wis 14 (+2) and proficiency +3 at level 5.
    expect(rows.at(-1)).toMatchObject({
      name: 'Psychic Resistance',
      ability: 'wis',
      bonus: 5,
      passive: 15,
      proficient: true,
    });
  });
});

describe('experience', () => {
  it('fills the bar from this level to the next', () => {
    // Level 5 starts at 6500 XP, level 6 at 14000.
    expect(xpProgress(rogue.stats)).toEqual({ xp: 7000, next: 14000, percent: 6 });
    expect(xpProgress({ level: 20, xp: 400000 })).toEqual({ xp: 400000, percent: 100 });
    expect(xpProgress({ level: 3 })).toBeUndefined();
  });
});

describe('inventory sections', () => {
  it('sorts gear by kind, with each container’s contents under it', () => {
    const sections = inventorySections(rogue.inventory!, '2014');
    expect(sections.map((s) => [s.id, s.indexes])).toEqual([
      ['weapons', [0]],
      ['armour', [1]],
      ['consumables', [2, 5]],
      ['gear', [3]],
      ['container-3', [4]],
    ]);
    expect(sections.at(-1)).toMatchObject({ name: 'Backpack', container: 3 });
  });

  it('leaves out kinds it has none of', () => {
    expect(inventorySections([{ item: 'rope', equipped: false, qty: 1 }], '2014').map((s) => s.id)).toEqual(['gear']);
  });
});

describe('feature sections', () => {
  it('puts features used as actions first, then passive ones', () => {
    const [active, passive] = featureSections(sheet.features);
    expect(active?.id).toBe('active');
    expect(active?.features.every((f) => f.action)).toBe(true);
    expect(passive?.features.some((f) => f.id === 'sneak-attack')).toBe(true);
  });
});

describe('spell columns', () => {
  it('give the casting time, range and roll in short', () => {
    expect(spellColumns(book.spells.get('fire-bolt')!, sheet.caster)).toEqual({
      time: 'Action',
      range: '120 ft',
      roll: 'Attack',
    });
    expect(spellColumns(book.spells.get('fireball')!, undefined)).toEqual({
      time: 'Action',
      range: '150 ft',
      roll: 'DEX save',
    });
    expect(spellColumns(book.spells.get('healing-word')!, undefined)).toMatchObject({ time: 'Bonus', roll: 'Heal' });
  });
});

describe('search', () => {
  it('matches names regardless of case and accents', () => {
    expect(matches('Potion of Healing', 'heal')).toBe(true);
    expect(matches('Épée', 'epee')).toBe(true);
    expect(matches('Torch', 'rope')).toBe(false);
    expect(matches('Torch', '')).toBe(true);
  });
});
