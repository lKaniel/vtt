import { describe, expect, it } from 'vitest';
import { FeatureSchema, type FeatureSheet } from '@vtt/system-dnd5e';
import { powerAim, powerFields, togglePick } from './power-aiming.ts';

const weave = FeatureSchema.parse({
  id: 'weave',
  name: 'Weave',
  level: 1,
  action: 'action',
  cost: 'base * senses * weight',
  inputs: [{ id: 'base', name: 'Base', min: 1, default: 1 }],
  options: [
    {
      id: 'senses',
      name: 'Senses',
      required: true,
      list: [
        { id: 'sight', name: 'Sight', cost: 1 },
        { id: 'sound', name: 'Sound', cost: 1 },
      ],
    },
    {
      id: 'emotion',
      name: 'Emotion',
      pick: 'one',
      list: [
        { id: 'fear', name: 'Fear' },
        { id: 'charm', name: 'Charm' },
      ],
    },
  ],
}) as FeatureSheet;

describe('aiming a pool feature', () => {
  it('starts with what it must have and its inputs at their defaults', () => {
    expect(powerAim(weave)).toEqual({ picks: ['sight', 'fear'], inputs: { base: 1 }, bonus: false });
  });

  it('toggles options, keeping one of a required group and swapping within a one-of group', () => {
    let aim = powerAim(weave);
    aim = togglePick(aim, weave, 'sound');
    expect(aim.picks).toEqual(['sight', 'fear', 'sound']);
    aim = togglePick(togglePick(aim, weave, 'sight'), weave, 'sound');
    expect(aim.picks).toEqual(['fear', 'sound']);
    expect(togglePick(aim, weave, 'charm').picks).toEqual(['sound', 'charm']);
  });

  it('sends its picks and inputs with the feature', () => {
    expect(powerFields({ ...powerAim(weave), bonus: true })).toEqual({
      picks: ['sight', 'fear'],
      inputs: { base: 1 },
      bonus: true,
    });
    expect(powerFields(undefined)).toEqual({});
  });
});
