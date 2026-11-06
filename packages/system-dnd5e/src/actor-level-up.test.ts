import { describe, expect, it } from 'vitest';
import { actorLevelPlan, levelUpActor } from './actor-level-up.ts';
import { srdFor } from './content.ts';
import type { Stats } from './stats-schema.ts';

// Levelling up a character that lives only as an actor (imported from
// Foundry, or made by hand): its stats gain a class level, hit points, a
// subclass and an ability score improvement when they are due.

const srd = srdFor('2014');
const scores = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const lory: Stats = { class: 'Ranger', level: 3, abilities: scores };

describe('the level-up plan', () => {
  it('says what the next level in a class brings', () => {
    expect(actorLevelPlan(lory, 'ranger', srd, '2014')).toMatchObject({
      level: 4,
      classLevel: 4,
      hitDie: 10,
      average: 6,
      improvement: true,
      // Imported without one, it may still pick its subclass.
      subclasses: [{ id: 'hunter', name: 'Hunter' }],
    });
    expect(actorLevelPlan({ class: 'Fighter', level: 2, abilities: scores }, 'fighter', srd, '2014')).toMatchObject({
      level: 3,
      improvement: false,
      subclasses: [{ id: 'champion' }],
    });
    expect(actorLevelPlan(lory, 'wizard', srd, '2014')).toMatchObject({ level: 4, classLevel: 1, hitDie: 6 });
  });

  it('has a problem at 20th level, or for a class the game lacks', () => {
    expect(actorLevelPlan({ class: 'Ranger', level: 20 }, 'ranger', srd, '2014').problem).toMatch(/20th/);
    expect(actorLevelPlan(lory, 'gunslinger', srd, '2014').problem).toMatch(/No class "gunslinger"/);
  });
});

describe('levelling up an actor', () => {
  it('adds a level to the class, written as classes, and raises two scores', () => {
    const next = levelUpActor(lory, { class: 'ranger', hp: 'average', improvement: { str: 1, con: 1 } }, srd, '2014');
    expect(next.classes).toEqual([{ class: 'ranger', level: 4 }]);
    expect(next.class).toBeUndefined();
    expect(next.level).toBeUndefined();
    expect(next.abilities).toMatchObject({ str: 17, con: 15 });
  });

  it('multiclasses into a new class and keeps the subclass picked when it is due', () => {
    const fighter: Stats = { class: 'fighter', level: 2, abilities: scores };
    const champ = levelUpActor(fighter, { class: 'fighter', hp: 'average', subclass: 'champion' }, srd, '2014');
    expect(champ.classes).toEqual([{ class: 'fighter', level: 3, subclass: 'champion' }]);
    const both = levelUpActor(champ, { class: 'wizard', hp: 'average' }, srd, '2014');
    expect(both.classes).toEqual([
      { class: 'fighter', level: 3, subclass: 'champion' },
      { class: 'wizard', level: 1 },
    ]);
  });

  it('adds rolled or average hit points to a written maximum, or writes one for a roll', () => {
    const tough: Stats = { ...lory, maxHp: 30 };
    expect(levelUpActor(tough, { class: 'ranger', hp: 'average' }, srd, '2014').maxHp).toBe(38);
    expect(levelUpActor(tough, { class: 'ranger', hp: 3 }, srd, '2014').maxHp).toBe(35);
    // Ranger 3 with Con 14: 10 + 2 + 2 × (6 + 2) = 28 by the average, then a roll of 9 and Con.
    expect(levelUpActor(lory, { class: 'ranger', hp: 9 }, srd, '2014').maxHp).toBe(39);
    expect(levelUpActor(lory, { class: 'ranger', hp: 'average' }, srd, '2014').maxHp).toBeUndefined();
  });

  it('refuses what the level does not allow', () => {
    const up =
      (choice: Parameters<typeof levelUpActor>[1], stats = lory) =>
      () =>
        levelUpActor(stats, choice, srd, '2014');
    expect(up({ class: 'ranger', hp: 11 })).toThrow(/d10/);
    expect(up({ class: 'ranger', hp: 'average', improvement: { str: 3 } })).toThrow(/2 points/);
    expect(up({ class: 'ranger', hp: 'average', improvement: { str: 2 } }, { ...lory, level: 4 })).toThrow(
      /no ability score improvement/,
    );
    expect(
      up({ class: 'ranger', hp: 'average', improvement: { cha: 2 } }, { ...lory, abilities: { ...scores, cha: 19 } }),
    ).toThrow(/above 20/);
    expect(up({ class: 'ranger', hp: 'average', subclass: 'champion' })).toThrow(/subclass/);
    expect(up({ class: 'ranger', hp: 'average' }, { class: 'ranger', level: 20 })).toThrow(/20th/);
  });
});
