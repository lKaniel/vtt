import { describe, expect, it } from 'vitest';
import { ownSpell } from './foundry-spells.ts';

// dnd5e 4+ spells: what they do is in their activities.

const missile = {
  name: 'Dark Missile',
  type: 'spell',
  system: {
    level: 1,
    school: 'evo',
    activation: { type: 'action', value: 1 },
    range: { value: '120', units: 'ft' },
    duration: { value: '', units: 'inst' },
    properties: ['vocal', 'material'],
    description: { value: '<p>A bolt of <b>dark</b> force.</p>' },
    activities: {
      a1: {
        type: 'attack',
        attack: { type: { value: 'ranged' } },
        damage: {
          parts: [
            {
              number: 1,
              denomination: 10,
              bonus: '@mod',
              types: ['force'],
              scaling: { mode: 'whole', formula: '1d10' },
            },
          ],
        },
      },
    },
  },
};

describe('ownSpell', () => {
  it('reads a spell attack with its damage and upcasting', () => {
    expect(ownSpell(missile, 'dark-missile')).toMatchObject({
      id: 'dark-missile',
      name: 'Dark Missile',
      level: 1,
      school: 'evocation',
      castingTime: 'action',
      range: 120,
      duration: 'Instantaneous',
      attack: 'ranged',
      damage: [{ dice: '1d10', type: 'force' }],
      upcast: { damage: '1d10' },
      automated: true,
      description: 'A bolt of dark force.',
    });
  });

  it('reads a save spell with a written-out formula, concentration and a duration', () => {
    const hadar = {
      name: 'Arms of Hadar',
      system: {
        level: 1,
        school: 'con',
        activation: { type: 'bonus' },
        range: { units: 'self' },
        duration: { value: '1', units: 'minute' },
        properties: ['concentration', 'ritual'],
        activities: {
          a: {
            type: 'save',
            save: { ability: ['str'] },
            damage: {
              onSave: 'half',
              parts: [{ types: ['necrotic'], custom: { enabled: true, formula: '2d6[necrotic]' } }],
            },
          },
        },
      },
    };
    expect(ownSpell(hadar, 'arms-of-hadar')).toMatchObject({
      school: 'conjuration',
      castingTime: 'bonus',
      range: 0,
      duration: '1 minute',
      concentration: true,
      ritual: true,
      save: { ability: 'str', onSave: 'half' },
      damage: [{ dice: '2d6', type: 'necrotic' }],
    });
  });

  it('keeps a spell it cannot read as text the GM applies by hand', () => {
    const odd = { name: 'Frostbite', system: { level: 0, school: '', range: { units: 'touch' }, activities: {} } };
    expect(ownSpell(odd, 'frostbite')).toMatchObject({
      level: 0,
      castingTime: 'action',
      range: 5,
      damage: [],
      automated: false,
    });
  });
});
