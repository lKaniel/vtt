import { srdFor } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { pipLeft, slotChoices, withResourceLeft, withSlotsLeft, withUsesLeft } from './charges.ts';

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

describe('setting any resource left from the sheet', () => {
  const sword = { item: 'wand-of-magic-missiles', qty: 1, equipped: false };

  it('writes slots, feature uses and legendary actions left as spent', () => {
    expect(withResourceLeft({}, { kind: 'slot', level: 1 }, { left: 1, total: 4 })).toEqual({ spent: { slots: [3] } });
    expect(withResourceLeft({}, { kind: 'use', id: 'legendary' }, { left: 1, total: 3 })).toEqual({
      spent: { uses: { legendary: 2 } },
    });
    expect(withResourceLeft({ spent: { uses: { ki: 2 } } }, { kind: 'use', id: 'ki' }, { left: 5, total: 5 })).toEqual(
      {},
    );
  });

  it("writes a class pool's points left against its whole size, reserved points included", () => {
    expect(withResourceLeft({}, { kind: 'pool', full: 16 }, { left: 13, total: 16 })).toEqual({ spent: { pool: 3 } });
    expect(withResourceLeft({}, { kind: 'pool', full: 16 }, { left: 10, total: 12 })).toEqual({ spent: { pool: 6 } });
    expect(withResourceLeft({ spent: { pool: 3 } }, { kind: 'pool', full: 16 }, { left: 16, total: 16 })).toEqual({});
  });

  it('writes hit dice left as hit dice spent', () => {
    expect(withResourceLeft({ spent: { slots: [1] } }, { kind: 'hitDice' }, { left: 2, total: 5 })).toEqual({
      spent: { slots: [1], hitDice: 3 },
    });
  });

  it("writes an item's charges left on its inventory entry", () => {
    const two = [sword, { ...sword, spent: 4 }];
    expect(withResourceLeft({ inventory: two }, { kind: 'charges', index: 0 }, { left: 3, total: 7 })).toEqual({
      inventory: [{ ...sword, spent: 4 }, two[1]],
    });
    expect(withResourceLeft({ inventory: two }, { kind: 'charges', index: 1 }, { left: 7, total: 7 })).toEqual({
      inventory: [sword, sword],
    });
  });

  it('keeps what is left between none and all', () => {
    expect(withResourceLeft({}, { kind: 'slot', level: 1 }, { left: 9, total: 4 })).toEqual({});
    expect(withResourceLeft({}, { kind: 'hitDice' }, { left: -2, total: 5 })).toEqual({ spent: { hitDice: 5 } });
  });
});

describe('one resource set from the sheet', () => {
  it('leaves what else was spent alone', () => {
    const spent = { slots: [1], pool: 2, hitDice: 1 };
    expect(withResourceLeft({ spent }, { kind: 'slot', level: 1 }, { left: 2, total: 2 })).toEqual({
      spent: { pool: 2, hitDice: 1 },
    });
  });
});
