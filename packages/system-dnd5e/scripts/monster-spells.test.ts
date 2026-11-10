import { describe, expect, it } from 'vitest';
import { monsterSpells } from './monster-spells.ts';
import type { Entry, Pack } from './srd-convert.ts';

const spell = (id: string): Entry => ({ id: `spells.${id}`, type: 'spell', fields: {} });
const SPELLS = ['fire-bolt', 'fireball', 'magic-missile', 'dancing-lights', 'darkness', 'faerie-fire', 'cone-of-cold'];
const NAMES = Object.fromEntries(
  SPELLS.map((id) => [`spells.${id}.name`, id.replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())]),
);

const pack = (entries: Entry[], text: Record<string, string> = {}): Pack => ({
  entries: new Map([...SPELLS.map(spell), ...entries].map((e) => [e.id, e])),
  text: { ...NAMES, ...text },
});
const casting = (id: string, fields: Record<string, unknown>, more: object = {}): Entry => ({
  id: `monsters.mage.${id}`,
  type: 'monsterAction',
  fields,
  ...more,
});
const of = (entries: Entry[], text: Record<string, string> = {}) =>
  monsterSpells(
    pack(entries, text),
    entries.map((e) => e.id),
  );

describe('monsterSpells', () => {
  it('reads a 2014 spellcaster: ability, DC, attack, caster level, slots and the spells it has prepared', () => {
    const entry = casting(
      'spellcasting',
      {
        kind: 'trait',
        spellAbility: 'int',
        spellDc: 14,
        spellAttack: 6,
        casterLevel: 9,
        slots1: 4,
        slots2: 3,
        slots3: 3,
      },
      { grants: [{ item: 'spells.fire-bolt' }, { item: 'spells.magic-missile' }, { item: 'spells.fireball' }] },
    );
    expect(of([entry])).toEqual({
      spellcasting: {
        ability: 'int',
        dc: 14,
        attack: 6,
        level: 9,
        slots: [4, 3, 3],
        spells: ['fire-bolt', 'magic-missile', 'fireball'],
      },
    });
  });

  it('reads innate spells from the words: at will, and so many a day each, as features that pay for the cast', () => {
    const entry = casting('innate-spellcasting', { kind: 'trait', spellAbility: 'cha', spellDc: 11, innate: true });
    const text =
      "The drow's spellcasting ability is Charisma (spell save DC 11). It can innately cast the following spells:\nAt will: *dancing lights*\n1/day each: *darkness*, *faerie fire*";
    const out = of([entry], { 'monsters.mage.innate-spellcasting.description': text });
    expect(out.spellcasting).toEqual({
      ability: 'cha',
      dc: 11,
      spells: ['dancing-lights', 'darkness', 'faerie-fire'],
    });
    expect(out.features).toEqual([
      expect.objectContaining({ id: 'at-will', name: 'Spells at will', freeCasts: [{ spell: 'dancing-lights' }] }),
      expect.objectContaining({
        id: 'daily-darkness',
        name: 'Darkness (1/Day)',
        uses: [[1, 1]],
        freeCasts: [{ spell: 'darkness' }],
      }),
      expect.objectContaining({ id: 'daily-faerie-fire', name: 'Faerie Fire (1/Day)' }),
    ]);
  });

  it('reads a 2024 list, with the level a spell is cast at, and skips spells the rules do not hold', () => {
    const entry = casting('spellcasting', { kind: 'action', spellAbility: 'int', spellDc: 14 });
    const text =
      'The mage casts one of the following spells (spell save DC 14):\n\n*At Will:* *Dancing Lights*, *Mage Armor* (included in AC)\n\n*2/Day Each:* *Fireball* (level 4 version), *Unknown Spell*\n\n*1/Day Each:* *Cone of Cold*';
    const out = of([entry], { 'monsters.mage.spellcasting.description': text });
    expect(out.spellcasting?.spells).toEqual(['dancing-lights', 'fireball', 'cone-of-cold']);
    expect(out.features?.map((f) => [f.id, f.uses, f.freeCasts])).toEqual([
      ['at-will', undefined, [{ spell: 'dancing-lights' }]],
      ['daily-fireball', [[1, 2]], [{ spell: 'fireball', level: 4 }]],
      ['daily-cone-of-cold', [[1, 1]], [{ spell: 'cone-of-cold' }]],
    ]);
  });

  it('joins a spellcaster that also casts innately: the slots lead', () => {
    const slots = casting(
      'spellcasting',
      { kind: 'trait', spellAbility: 'wis', spellDc: 15, slots1: 4 },
      { grants: [{ item: 'spells.magic-missile' }] },
    );
    const innate = casting('innate-spellcasting', { kind: 'trait', spellAbility: 'cha', spellDc: 12, innate: true });
    const out = of([slots, innate], { 'monsters.mage.innate-spellcasting.description': 'At will: *darkness*' });
    expect(out.spellcasting).toMatchObject({
      ability: 'wis',
      dc: 15,
      slots: [4],
      spells: ['magic-missile', 'darkness'],
    });
  });

  it('gives nothing to a monster that casts no spells', () => {
    expect(of([casting('bite', { attack: 'melee' })])).toEqual({});
  });
});
