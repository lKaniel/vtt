import { describe, expect, it } from 'vitest';
import { foundryDelta, foundrySheet, foundrySheets } from './foundry-actor.ts';
import { ActorSchema } from './token-schema.ts';

// Foundry's dnd5e system data (v3 to v5 field names; older ones where they differ).

/** Foundry's ability block for scores in STR, DEX, CON, INT, WIS, CHA order. */
const abilities = (...scores: number[]) =>
  Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a, i) => [a, { value: scores[i] }]));

const goblin = {
  name: 'Goblin',
  type: 'npc',
  system: {
    abilities: abilities(8, 14, 10, 10, 8, 8),
    attributes: { hp: { value: 4, max: 7 }, ac: { flat: 15, calc: 'natural' }, movement: { walk: 30 } },
    details: { cr: 0.25 },
    traits: { size: 'sm' },
  },
  items: [{ name: 'Scimitar', type: 'weapon', system: {} }],
};

const sheet = (data: unknown, rules: '2014' | '2024' = '2014') => foundrySheet(data, { rules });

describe('foundrySheet', () => {
  it('uses the SRD stat block of a monster it has, keeping its wounds', () => {
    expect(sheet(goblin)).toEqual({ sheet: { monster: 'goblin', hp: 4 }, skipped: [] });
  });

  it('reads a monster we do not have from its numbers, attacks from its weapons', () => {
    const grik = {
      ...goblin,
      name: 'Grik the Cruel',
      system: {
        ...goblin.system,
        attributes: {
          ...goblin.system.attributes,
          hp: { value: 21, max: 21 },
          senses: { darkvision: 60 },
          movement: { walk: 40 },
        },
        details: { cr: 5 },
        traits: { size: 'lg', dr: { value: ['fire', 'nonsense'] } },
      },
      items: [
        {
          name: 'Cruel Cleaver',
          type: 'weapon',
          system: {
            type: { value: 'martialM' },
            damage: { base: { number: 2, denomination: 6, types: ['slashing'] } },
            properties: ['hvy'],
            attack: { bonus: '1' },
          },
        },
        {
          name: 'Old Bow',
          type: 'weapon',
          system: {
            actionType: 'rwak',
            damage: { parts: [['1d8 + @mod', 'piercing']] },
            range: { value: 80, long: 320 },
          },
        },
        {
          name: 'Pack Tactics',
          type: 'feat',
          system: { description: { value: '<p>Advantage with <b>allies</b>.</p>' } },
        },
      ],
    };
    const { sheet: s, skipped } = sheet(grik);
    expect(s).toEqual({
      size: 2,
      speed: 40,
      darkvision: 60,
      stats: {
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        maxHp: 21,
        ac: 15,
        proficiency: 3,
        resistances: ['fire'],
        attacks: [
          { name: 'Cruel Cleaver', kind: 'melee', toHit: 3, reach: 5, damage: [{ dice: '2d6-1', type: 'slashing' }] },
          {
            name: 'Old Bow',
            kind: 'ranged',
            toHit: 5,
            range: [80, 320],
            damage: [{ dice: '1d8+2', type: 'piercing' }],
          },
        ],
      },
      own: {
        features: [{ id: 'pack-tactics', name: 'Pack Tactics', level: 1, description: 'Advantage with allies.' }],
      },
    });
    expect(skipped).toEqual([]);
    expect(ActorSchema.safeParse({ id: 'grik', name: 'Grik', ...s }).success).toBe(true);
  });

  it('builds a character from its classes, gear and spells, matching the SRD by name', () => {
    const mira = {
      name: 'Mira',
      type: 'character',
      system: {
        abilities: abilities(10, 14, 14, 17, 12, 8),
        attributes: {
          hp: { value: 20, max: 20, temp: 3 },
          ac: { calc: 'default' },
          senses: { ranges: { darkvision: 60 } },
        },
        skills: { arc: { value: 1 }, ste: { value: 0 }, prc: { proficient: 2 } },
        traits: { size: 'med' },
      },
      items: [
        { name: 'Wizard', type: 'class', system: { levels: 3 } },
        { name: 'Fighter', type: 'class', system: { levels: 1 } },
        { name: 'Dagger', type: 'weapon', system: { equipped: true, quantity: 2 } },
        { name: 'Leather Armor', type: 'equipment', system: { equipped: true } },
        { name: 'Crossbow, light', type: 'weapon', system: {} },
        { name: 'Potion of Healing', type: 'consumable', system: { quantity: 3 } },
        { name: 'Lucky Coin', type: 'loot', system: { weight: { value: 0.1 }, description: { value: 'Shiny.' } } },
        { name: 'Fire Bolt', type: 'spell', system: {} },
        { name: 'Shield', type: 'spell', system: {} },
        { name: 'Glimmer of Amar', type: 'spell', system: {} },
        { name: 'Arcane Recovery', type: 'feat', system: { type: { value: 'class' } } },
        { name: 'Second Wind', type: 'feat', system: {} },
      ],
    };
    const { sheet: s, skipped } = sheet(mira);
    expect(s).toEqual({
      darkvision: 60,
      tempHp: 3,
      stats: {
        abilities: { str: 10, dex: 14, con: 14, int: 17, wis: 12, cha: 8 },
        maxHp: 20,
        class: 'Wizard',
        level: 4,
        skills: ['arcana', 'perception'],
        spells: ['fire-bolt', 'shield'],
      },
      inventory: [
        { item: 'dagger', equipped: true, qty: 2 },
        { item: 'leather', equipped: true },
        { item: 'light-crossbow' },
        { item: 'potion-of-healing', qty: 3 },
        { item: 'lucky-coin' },
      ],
      own: { items: [{ type: 'gear', id: 'lucky-coin', name: 'Lucky Coin', weight: 0.1, description: 'Shiny.' }] },
    });
    expect(skipped).toEqual([
      'classes: one class per sheet here, so Wizard 3 / Fighter 1 became Wizard 4',
      'spell "Glimmer of Amar", which the 2014 rules have no match for',
    ]);
    expect(ActorSchema.safeParse({ id: 'mira', name: 'Mira', ...s }).success).toBe(true);
  });

  it('reads 2024 content when the game plays 2024 rules', () => {
    expect(sheet({ ...goblin, name: 'Goblin Warrior' }, '2024').sheet.monster).toBe('goblin-warrior');
    expect(sheet({ ...goblin, name: 'Goblin Warrior' }, '2014').sheet.monster).toBeUndefined();
  });

  it('gives a vehicle or group nothing to play with', () => {
    expect(sheet({ name: 'Cart', type: 'vehicle', system: {} })).toEqual({
      sheet: {},
      skipped: ['a vehicle sheet, which we have no match for'],
    });
  });
});

describe('foundryDelta', () => {
  it("keeps an unlinked token's own hit points", () => {
    expect(foundryDelta({ system: { attributes: { hp: { value: 2 } } } })).toEqual({ hp: 2 });
    expect(foundryDelta({ data: { attributes: { hp: { value: 0 } } } })).toEqual({ hp: 0 });
    expect(foundryDelta(null)).toEqual({});
  });
});

describe('foundrySheets.rules', () => {
  it('plays 2024 in a world set to the modern rules', () => {
    const world = (version: unknown) => (key: string) => (key === 'dnd5e.rulesVersion' ? version : undefined);
    expect(foundrySheets.rules(world('modern'))).toBe('2024');
    expect(foundrySheets.rules(world('legacy'))).toBe('2014');
    expect(foundrySheets.rules(world(undefined))).toBeUndefined();
  });
});
