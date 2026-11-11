import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { dropOnSheet, handOver, scrollCaster, scrollProblem } from './sheet-drops.ts';
import { type Token, TokenSchema } from './token-schema.ts';

const book = srdFor('2014');
const hero = TokenSchema.parse({
  id: 'hero',
  name: 'Hero',
  x: 50,
  y: 50,
  stats: { class: 'wizard', level: 3, spells: ['fire-bolt'] },
  inventory: [{ item: 'dagger', qty: 1 }],
});

describe('dropping compendium entries on a character sheet', () => {
  it('adds an item to the inventory wherever it lands, stacking copies', () => {
    const once = dropOnSheet(hero, { kind: 'item', id: 'dagger' }, 'spells', book);
    expect(once).toMatchObject({ sheet: { inventory: [{ item: 'dagger', qty: 2 }] } });
    const sword = dropOnSheet(hero, { kind: 'item', id: 'longsword' }, undefined, book);
    expect('sheet' in sword && sword.sheet.inventory?.at(-1)).toEqual({ item: 'longsword', qty: 1, equipped: false });
    expect(dropOnSheet(hero, { kind: 'item', id: 'nope' }, undefined, book)).toEqual({
      problem: 'There is no item "nope"',
    });
  });

  it('teaches a spell dropped on the spells or anywhere but the inventory', () => {
    for (const area of ['spells', 'features', undefined] as const) {
      const out = dropOnSheet(hero, { kind: 'spell', id: 'shield', rules: '2014' }, area, book);
      expect(out).toMatchObject({ sheet: { stats: { spells: ['fire-bolt', 'shield'] } } });
    }
    expect(dropOnSheet(hero, { kind: 'spell', id: 'fire-bolt', rules: '2014' }, 'spells', book)).toEqual({
      problem: 'Hero already knows Fire Bolt',
    });
  });

  it('makes a spell dropped in the inventory a scroll, stacking scrolls of the same spell', () => {
    const one = dropOnSheet(hero, { kind: 'spell', id: 'fireball', rules: '2014' }, 'inventory', book);
    const scrolled = 'sheet' in one ? one.sheet : hero;
    expect(scrolled.inventory?.at(-1)).toEqual({ item: 'spell-scroll', spell: 'fireball', qty: 1, equipped: false });
    expect(scrolled.stats?.spells).toEqual(['fire-bolt']);
    const two = dropOnSheet(scrolled, { kind: 'spell', id: 'fireball', rules: '2014' }, 'inventory', book);
    const other = dropOnSheet(scrolled, { kind: 'spell', id: 'shield', rules: '2014' }, 'inventory', book);
    expect('sheet' in two && two.sheet.inventory?.at(-1)).toMatchObject({ spell: 'fireball', qty: 2 });
    expect('sheet' in other && other.sheet.inventory?.length).toBe(3);
  });

  it('looks spells up in the creature’s own rules', () => {
    const cleric = { ...hero, stats: { rules: '2024' as const } };
    expect(
      dropOnSheet(cleric, { kind: 'spell', id: 'branding-smite', rules: '2014' }, 'spells', srdFor('2024')),
    ).toEqual({
      problem: 'Hero plays by the 2024 rules, which have no spell "branding-smite"',
    });
  });

  it('grants a class feature on top of the class, once', () => {
    const out = dropOnSheet(hero, { kind: 'feature', id: 'rage', class: 'barbarian', rules: '2014' }, 'features', book);
    expect(out).toMatchObject({ sheet: { stats: { features: ['barbarian/rage'] } } });
    const raging = 'sheet' in out ? out.sheet : hero;
    expect(resolveCreature(raging, book)!.features.find((f) => f.id === 'rage')).toMatchObject({ max: 3, left: 3 });
    expect(
      dropOnSheet(raging, { kind: 'feature', id: 'rage', class: 'barbarian', rules: '2014' }, undefined, book),
    ).toEqual({ problem: 'Hero already has Rage' });
    expect(
      dropOnSheet(hero, { kind: 'feature', id: 'arcane-recovery', class: 'wizard', rules: '2014' }, undefined, book),
    ).toEqual({ problem: 'Hero already has Arcane Recovery' });
    expect(dropOnSheet(hero, { kind: 'feature', id: 'x', class: 'wizard', rules: '2014' }, undefined, book)).toEqual({
      problem: 'There is no feature "wizard/x" in the 2014 rules',
    });
  });
});

describe('dropping a species on a character sheet', () => {
  it('sets its species, walking speed, darkvision and fixed proficiencies', () => {
    const out = dropOnSheet(
      { ...hero, speed: 30, darkvision: 0 },
      { kind: 'species', id: 'dwarf', rules: '2014' },
      undefined,
      book,
    );
    expect(out).toMatchObject({ sheet: { speed: 25, darkvision: 60, stats: { species: 'dwarf' } } });
    const sheet = 'sheet' in out ? out.sheet : undefined;
    expect(sheet?.stats?.proficiencies).toEqual(expect.arrayContaining(['battleaxe', 'dwarvish']));
  });

  it('replaces the species it had, and keeps a first species from lowering darkvision', () => {
    const elf = { ...hero, speed: 30, darkvision: 60, stats: { ...hero.stats, species: 'elf' } };
    const out = dropOnSheet(elf, { kind: 'species', id: 'human', rules: '2014' }, undefined, book);
    expect(out).toMatchObject({ sheet: { speed: 30, darkvision: 0, stats: { species: 'human' } } });
    const seer = dropOnSheet(
      { ...hero, darkvision: 120 },
      { kind: 'species', id: 'elf', rules: '2014' },
      undefined,
      book,
    );
    expect(seer).toMatchObject({ sheet: { darkvision: 120 } });
    expect(dropOnSheet(hero, { kind: 'species', id: 'nope', rules: '2014' }, undefined, book)).toEqual({
      problem: 'The 2014 rules have no species "nope"',
    });
  });
});

describe('handing an item to another creature', () => {
  const ally = TokenSchema.parse({ id: 'ally', name: 'Ally', x: 0, y: 0, inventory: [{ item: 'dagger', qty: 2 }] });

  it('moves the whole stack, unequipped, onto the same kind of item', () => {
    const giver = { ...hero, inventory: [{ item: 'dagger', qty: 3, equipped: true }] };
    const out = handOver<Token>(giver, ally, { item: 'dagger' });
    expect(out).toMatchObject({ from: { inventory: undefined }, to: { inventory: [{ item: 'dagger', qty: 5 }] } });
    expect('to' in out && out.to.inventory?.[0]?.equipped).toBe(false);
  });

  it('keeps scrolls of different spells apart', () => {
    const giver = { ...hero, inventory: [{ item: 'spell-scroll', spell: 'shield', qty: 1, equipped: false }] };
    const out = handOver<Token>(giver, ally, { item: 'spell-scroll', spell: 'shield' });
    expect('to' in out && out.to.inventory?.at(-1)).toEqual({
      item: 'spell-scroll',
      spell: 'shield',
      qty: 1,
      equipped: false,
    });
    expect(handOver<Token>(giver, ally, { item: 'spell-scroll', spell: 'fireball' })).toEqual({
      problem: "Hero doesn't carry that",
    });
  });
});

describe('reading a spell scroll', () => {
  it('uses the scroll’s save DC and attack bonus for its spell level', () => {
    const fireball = book.spells.get('fireball')!;
    const sheet = resolveCreature(hero, book)!;
    expect(scrollCaster(sheet, fireball, 3)).toMatchObject({ dc: 15, attack: 7, spells: [fireball] });
    const wish = { ...fireball, level: 9 };
    expect(scrollCaster(sheet, wish, 3)).toMatchObject({ dc: 19, attack: 11 });
    const fighter = resolveCreature({ ...hero, stats: { class: 'fighter', level: 5 } }, book)!;
    expect(scrollCaster(fighter, book.spells.get('fire-bolt')!, 5)).toMatchObject({ dc: 13, attack: 5, level: 5 });
  });

  it('can be read only by a class with the spell on its list (SRD Spell Scroll)', () => {
    const fireball = book.spells.get('fireball')!;
    expect(scrollProblem(hero, fireball, book)).toBeUndefined();
    const fighter = { ...hero, stats: { class: 'fighter', level: 5 } };
    expect(scrollProblem(fighter, fireball, book)).toBe('can’t read Fireball: it isn’t on the fighter spell list');
    const cleric = { ...hero, stats: { class: 'cleric', level: 5 } };
    expect(scrollProblem(cleric, book.spells.get('cure-wounds')!, book)).toBeUndefined();
    // Multiclassed: any of its classes' lists will do.
    const both = {
      ...hero,
      stats: {
        classes: [
          { class: 'fighter', level: 3 },
          { class: 'wizard', level: 1 },
        ],
      },
    };
    expect(scrollProblem(both, fireball, book)).toBeUndefined();
  });

  it('is read by creatures without a class, and by a class no spell lists (homebrew)', () => {
    const goblin = TokenSchema.parse({ id: 'g', name: 'Goblin', x: 0, y: 0, monster: 'goblin' });
    expect(scrollProblem(goblin, book.spells.get('fireball')!, book)).toBeUndefined();
    const illusionist = { ...book.classes.get('wizard')!, id: 'illusionist', name: 'Illusionist' };
    const homebrew = { ...book, classes: new Map([...book.classes, ['illusionist', illusionist]]) };
    const odd = { ...hero, stats: { class: 'illusionist', level: 3 } };
    expect(scrollProblem(odd, book.spells.get('fireball')!, homebrew)).toBeUndefined();
  });
});
