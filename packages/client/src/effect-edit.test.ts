import { describe, expect, it } from 'vitest';
import { blankChange, newEffect, removeEffect, setEffect } from './effect-edit.ts';

const draft = (effects?: object[]) => ({ id: 'a', name: 'A', speed: 30, effects }) as never;

describe('editing effects on a sheet', () => {
  it('adds a new effect with a unique id', () => {
    const { draft: d1, id } = newEffect(draft([{ id: 'effect', name: 'Old' }]));
    expect(id).not.toBe('effect');
    expect(d1.effects!.map((e) => e.id)).toEqual(['effect', id]);
    expect(d1.effects![1]).toMatchObject({ name: 'New effect', changes: [] });
  });

  it('replaces an effect by id and removes it, dropping an empty list', () => {
    const d = draft([{ id: 'x', name: 'X' }]);
    expect(setEffect(d, { id: 'x', name: 'Y' }).effects).toEqual([{ id: 'x', name: 'Y' }]);
    expect(removeEffect(d, 'x').effects).toBeUndefined();
  });

  it('starts a new change as +1 AC', () => {
    expect(blankChange()).toEqual({ key: 'ac', mode: 'add', value: 1 });
  });
});
