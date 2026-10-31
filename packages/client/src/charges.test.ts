import { srdFor } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { pipLeft, slotChoices, withSlotsLeft, withUsesLeft } from './charges.ts';

const spell = (id: string) => srdFor('2014').spells.get(id)!;

describe('choosing a slot for a spell', () => {
  it('offers every slot level from the spell up, with how many are left', () => {
    const caster = { slots: [4, 3, 2, 0, 0, 0, 0, 0, 0], left: [0, 2, 1, 0, 0, 0, 0, 0, 0] };
    expect(slotChoices(spell('magic-missile'), caster)).toEqual([
      { level: 1, left: 0, total: 4 },
      { level: 2, left: 2, total: 3 },
      { level: 3, left: 1, total: 2 },
    ]);
    expect(slotChoices(spell('fireball'), caster)).toEqual([{ level: 3, left: 1, total: 2 }]);
  });

  it("still offers the spell's own level when the caster has no slots that high", () => {
    expect(slotChoices(spell('fireball'), { slots: [2], left: [2] })).toEqual([{ level: 3, left: 0, total: 0 }]);
  });
});

describe('clicking charge pips', () => {
  it('spends from the clicked pip on, or restores up to it', () => {
    expect(pipLeft(2, 3)).toBe(2);
    expect(pipLeft(0, 3)).toBe(0);
    expect(pipLeft(3, 3)).toBe(4);
    expect(pipLeft(1, 0)).toBe(2);
  });

  it('writes slots left back as slots spent', () => {
    expect(withSlotsLeft(undefined, { level: 2, left: 1, total: 3 })).toEqual({ slots: [0, 2] });
    expect(withSlotsLeft({ slots: [1, 2], uses: { rage: 1 } }, { level: 2, left: 3, total: 3 })).toEqual({
      slots: [1, 0],
      uses: { rage: 1 },
    });
    expect(withSlotsLeft({ slots: [0, 1] }, { level: 2, left: 3, total: 3 })).toBeUndefined();
  });

  it('writes feature uses left back as uses spent', () => {
    expect(withUsesLeft(undefined, { id: 'rage', left: 1, max: 3 })).toEqual({ uses: { rage: 2 } });
    expect(withUsesLeft({ slots: [1], uses: { rage: 2 } }, { id: 'rage', left: 3, max: 3 })).toEqual({ slots: [1] });
  });
});
