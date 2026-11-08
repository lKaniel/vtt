import { ClassSchema } from './spell-schema.ts';
import { resolveCreature } from './creature.ts';
import { srdFor } from './content.ts';
import { withOwn } from './own-content.ts';
import type { Token } from './token-schema.ts';

// A small pool class for tests, shaped like a homebrew illusionist: a pool
// with Mind Weight, a held Weave with senses, a bolt with shapes, a reserved
// Glamour and a bolt for linked creatures only.

const senses = {
  id: 'senses',
  name: 'Senses',
  required: true,
  list: [
    { id: 'sight', name: 'Sight', cost: 1 },
    { id: 'sound', name: 'Sound', cost: 1 },
    { id: 'pain', name: 'Pain', level: 7, cost: 5, set: { effect: { disadvantage: true, speedTimes: 0.5 } } },
  ],
};

export const POOL_CLASS = ClassSchema.parse({
  id: 'illusionist',
  name: 'Illusionist',
  hitDie: 8,
  saves: ['wis', 'int'],
  pool: {
    id: 'lucidity',
    name: 'Lucidity',
    ability: 'wis',
    recharge: 'short',
    concurrent: 0.5,
    max: [
      [1, 12],
      [2, 16],
      [3, 20],
      [5, 40],
      [7, 60],
    ],
    weight: {
      name: 'Mind Weight',
      tiers: [
        [0, 1],
        [1, 2],
        [4, 3],
      ],
      ability: 'wis',
      base: 0.75,
      per: 0.25,
      min: 0.25,
    },
  },
  features: [
    {
      id: 'weave',
      name: 'Weave Illusion',
      level: 1,
      action: 'action',
      cost: 'base * senses * weight',
      hold: true,
      group: 'weave',
      quick: 0.25,
      inputs: [{ id: 'base', name: 'Base cost', min: 1, default: 1 }],
      options: [senses],
      spell: { targets: 10, range: 60, concentration: true, rounds: 10, effect: { name: 'Weave', linked: true } },
      upgrades: [
        { level: 6, set: { followUp: 'bolt' } },
        { level: 11, set: { quickAny: true } },
      ],
    },
    {
      id: 'zone',
      name: 'Haunting Zone',
      level: 5,
      action: 'action',
      cost: 'senses * 4',
      hold: true,
      group: 'weave',
      options: [senses],
      spell: {
        targets: 0,
        concentration: true,
        effect: { name: 'Haunted', linked: true, aura: { radius: 15, who: 'all', self: false, maxWeight: 2 } },
      },
    },
    {
      id: 'rewrite',
      name: 'Rewrite',
      level: 13,
      action: 'action',
      uses: [[13, 1]],
      cost: '0',
      costWhenSpent: 'weight * 10',
      spell: { range: 30, save: { ability: 'wis' }, effect: { name: 'Rewritten', rounds: 1 } },
    },
    {
      id: 'bomb',
      name: 'Glamour Bomb',
      level: 16,
      action: 'action',
      cost: '0',
      consumes: 'glamour',
      spell: {
        area: { shape: 'emanation', size: 15 },
        save: { ability: 'wis' },
        damage: [{ dice: '1d10+{mod}', type: 'psychic' }],
      },
    },
    {
      id: 'bolt',
      name: 'Phantasmal Bolt',
      level: 1,
      action: 'action',
      cost: 'shapes',
      linkedTimes: 0.5,
      modFrom: 2,
      times: [
        [1, 1],
        [3, 1.5],
      ],
      options: [
        {
          id: 'shapes',
          name: 'Shapes',
          list: [
            {
              id: 'disorienting',
              name: 'Disorienting',
              cost: 'weight',
              set: { effect: { name: 'Disoriented', speed: -10, rounds: 1 } },
            },
            { id: 'homing', name: 'Homing', cost: '2 * weight', set: { attack: null, save: { ability: 'wis' } } },
          ],
        },
      ],
      spell: { attack: 'ranged', range: 120, minInt: 3, damage: [{ dice: '1d10+{mod}', type: 'psychic' }] },
    },
    {
      id: 'glamour',
      name: 'Glamour',
      level: 2,
      action: 'free',
      ritual: true,
      reserve: true,
      cost: 'senses * strength',
      inputs: [{ id: 'strength', name: 'Strength', min: 1, default: 1 }],
      options: [senses],
      spell: { targets: 0, effect: { name: 'Glamour' } },
    },
    {
      id: 'volley',
      name: 'Phantom Volley',
      level: 5,
      action: 'action',
      cost: '2 * weight',
      spell: {
        targets: 10,
        linkedOnly: true,
        save: { ability: 'wis', onSave: 'half' },
        damage: [{ dice: '1d10+{mod}', type: 'psychic' }],
        crowd: { atLeast: 3, ability: 'wis', effect: { name: 'Barrage', conditions: ['frightened'], rounds: 1 } },
      },
      times: [
        [1, 1],
        [5, 2],
      ],
    },
    { id: 'misdirection', name: 'Misdirection', level: 2, cost: '2 * weight', reaction: { when: 'hit', does: 'veil' } },
    {
      id: 'redirect',
      name: 'Redirect',
      level: 7,
      cost: 'weight',
      reaction: { when: 'hit', does: 'redirect', with: 'misdirection' },
    },
    {
      id: 'phantom-step',
      name: 'Phantom Step',
      level: 11,
      cost: '2 * weight',
      reaction: { when: 'save', does: 'evade' },
    },
    {
      id: 'unreal-self',
      name: 'Unreal Self',
      level: 18,
      cost: '3 * weight',
      reaction: { when: 'hit', does: 'negate', with: 'misdirection' },
      spell: { effect: { name: 'Lost track', forCaster: true, disadvantage: true, advantageAgainst: true, rounds: 1 } },
    },
    {
      id: 'shadow-substance',
      name: 'Shadow Substance',
      level: 14,
      action: 'bonus',
      cost: '0',
      group: 'weave',
      spell: {
        range: 60,
        concentration: true,
        summon: {
          options: [
            {
              monster: 'shadow-substance',
              creature: {
                name: 'Shadow Substance',
                type: 'construct',
                abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
                ac: { base: 18 },
                hp: { base: 5, perLevel: 5, from: 1 },
                attacks: [
                  {
                    name: 'Shadow strike',
                    kind: 'melee',
                    damage: [{ dice: '1d10', type: 'psychic', times: 1.75 }],
                    plusMod: true,
                  },
                ],
              },
            },
          ],
        },
      },
    },
    {
      id: 'mind-fortress',
      name: 'Mind Fortress',
      level: 8,
      passive: { resistances: ['psychic'] },
    },
  ],
});

/** An illusionist of `level` with Wisdom 16 carrying the class. */
export function poolCaster(level = 1, over: Partial<Token> = {}): Token {
  return {
    id: 'nyx',
    name: 'Nyx',
    x: 0,
    y: 0,
    size: 1,
    speed: 30,
    ownership: { default: 'none', kaniel: 'owner' },
    stats: { class: 'illusionist', level, abilities: { str: 8, dex: 14, con: 12, int: 10, wis: 16, cha: 10 } },
    own: { classes: [POOL_CLASS] },
    ...over,
  } as Token;
}

export const poolSheetOf = (token: Token) => resolveCreature(token, withOwn(srdFor('2014'), token))!;
