import { describe, expect, it } from 'vitest';
import { foundryEffects } from './foundry-effects.ts';

const change = (key: string, value: string, type = 'add') => ({ key, value, type });

describe('foundryEffects', () => {
  it('turns the changes an item gives its bearer into effect changes', () => {
    const actor = {
      items: [
        {
          name: 'Dwarf',
          type: 'race',
          effects: [{ name: 'Dwarven Resilience', system: { changes: [change('system.traits.dr.value', 'poison')] } }],
        },
        {
          name: 'Ring of Protection',
          type: 'equipment',
          system: { equipped: true, attunement: 'required', attuned: true },
          effects: [
            {
              name: 'Ring of Protection',
              changes: [
                { key: 'system.attributes.ac.bonus', value: '+1', mode: 2 },
                { key: 'system.bonuses.abilities.save', value: '1', mode: 2 },
              ],
            },
          ],
        },
        {
          name: 'Belt of Giant Strength',
          type: 'equipment',
          system: { equipped: false },
          effects: [{ name: 'Belt', changes: [change('system.abilities.str.value', '21', 'override')] }],
        },
      ],
    };
    expect(foundryEffects(actor)).toEqual({
      effects: [
        {
          id: 'dwarven-resilience',
          name: 'Dwarven Resilience',
          changes: [{ key: 'resistances', mode: 'add', value: 'poison' }],
        },
        {
          id: 'ring-of-protection',
          name: 'Ring of Protection',
          changes: [
            { key: 'ac', mode: 'add', value: 1 },
            { key: 'saves.all', mode: 'add', value: 1 },
          ],
        },
      ],
      skipped: [],
    });
  });

  it("keeps an actor's own effects with their conditions, and leaves out what only fires on use", () => {
    const actor = {
      effects: [
        { name: 'Poisoned', statuses: ['poisoned'], changes: [] },
        { name: 'Off', disabled: true, statuses: ['prone'] },
        { name: 'Wise', changes: [change('system.skills.arc.bonuses.check', '(max(1,@abilities.wis.mod))')] },
      ],
      items: [
        { name: 'Net', type: 'weapon', effects: [{ name: 'Netted', transfer: false, statuses: ['restrained'] }] },
      ],
    };
    const { effects, skipped } = foundryEffects(actor);
    expect(effects).toEqual([{ id: 'poisoned', name: 'Poisoned', conditions: ['poisoned'] }]);
    expect(skipped).toEqual([
      {
        what: 'Active effect changes we have no match for (Foundry automation)',
        count: 1,
        examples: ['system.skills.arc.bonuses.check'],
      },
      {
        what: 'Item effects that land on a target when used (the effect stays with Foundry)',
        count: 1,
        examples: ['Netted'],
      },
    ]);
  });
});
