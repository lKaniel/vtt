import { describe, expect, it } from 'vitest';
import { casterSheet, featureSheets } from './classes.ts';
import { choicesDue, grantedFeatures } from './class-options.ts';
import { srdFor } from './content.ts';
import { classLevels } from './multiclass.ts';
import { TokenSchema } from './token-schema.ts';

// Subclasses and the options a character picks (fighting styles,
// invocations, a druid's land) come with the SRD classes.

const token = (stats: object) => TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, stats });
const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 };
const basics = { abilities, proficiency: 2 };

const spellIds = (t: ReturnType<typeof token>, edition: '2014' | '2024' = '2014') =>
  casterSheet(t, basics, srdFor(edition))?.spells.map((s) => s.id) ?? [];

const featureIds = (t: ReturnType<typeof token>, edition: '2014' | '2024' = '2014') => {
  const content = srdFor(edition);
  return featureSheets(t, classLevels(t, content), abilities, grantedFeatures(t, content)).map((f) => f.id);
};

describe('subclasses', () => {
  it('every SRD class has its SRD subclass in both editions', () => {
    for (const edition of ['2014', '2024'] as const) {
      for (const cls of srdFor(edition).classes.values()) expect(cls.subclasses?.length, cls.id).toBe(1);
    }
  });

  it('give their features at their level', () => {
    const cleric = token({ classes: [{ class: 'cleric', level: 2, subclass: 'life-domain' }] });
    expect(featureIds(cleric)).toEqual(expect.arrayContaining(['disciple-of-life', 'preserve-life']));
    expect(featureIds(token({ class: 'cleric', level: 2 }))).not.toContain('disciple-of-life');
  });

  it('always have their domain spells prepared, up to the class level', () => {
    const cleric = token({ classes: [{ class: 'cleric', level: 3, subclass: 'life-domain' }], spells: ['guidance'] });
    expect(spellIds(cleric)).toEqual(
      expect.arrayContaining(['guidance', 'bless', 'cure-wounds', 'lesser-restoration', 'spiritual-weapon']),
    );
    expect(spellIds(cleric)).not.toContain('beacon-of-hope');
  });

  it('give spells from class features (a 2024 paladin’s smite)', () => {
    expect(spellIds(token({ class: 'paladin', level: 2 }), '2024')).toContain('divine-smite');
  });
});

describe('class options', () => {
  it('a picked subclass option is granted with its spells', () => {
    const druid = token({
      classes: [{ class: 'druid', level: 3, subclass: 'circle-of-the-land' }],
      features: ['druid/arctic'],
    });
    expect(featureIds(druid)).toContain('arctic');
    expect(spellIds(druid)).toEqual(expect.arrayContaining(['hold-person', 'spike-growth']));
  });

  it('are due by level, the subclass’s too', () => {
    const ranger = srdFor('2014').classes.get('ranger')!;
    const due = choicesDue(ranger, 3, ['ranger/archery'], 'hunter');
    expect(due.map((c) => c.id)).toEqual(['favored-enemy', 'natural-explorer', 'fighting-style', 'hunters-prey']);
    expect(due.find((c) => c.id === 'fighting-style')).toMatchObject({ count: 1, picked: ['archery'] });
    expect(due.find((c) => c.id === 'hunters-prey')?.options.map((o) => o.id)).toContain('colossus-slayer');
  });

  it('only offer options whose level has come (invocations needing 5th level)', () => {
    const warlock = srdFor('2014').classes.get('warlock')!;
    const at2 = choicesDue(warlock, 2, []).find((c) => c.id === 'eldritch-invocations')!;
    expect(at2.count).toBe(2);
    expect(at2.options.map((o) => o.id)).not.toContain('thirsting-blade');
  });
});
