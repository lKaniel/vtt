import { describe, expect, it } from 'vitest';
import { auraText, blankChange, newEffect, removeEffect, setAura, setEffect } from './effect-edit.ts';

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

describe('auras on the sheet', () => {
  it('says where an aura copy comes from, and what an aura reaches', () => {
    const names = (id: string) => (id === 'kara' ? 'Kara' : undefined);
    expect(auraText({ id: 'a', name: 'A', auraFrom: 'kara:aura-of-protection' }, names)).toBe('aura from Kara');
    expect(auraText({ id: 'a', name: 'A', auraFrom: 'gone:x' }, names)).toBe('aura');
    expect(auraText({ id: 'b', name: 'B', aura: { radius: 10, who: 'enemies' } }, names)).toBe('aura 10 ft, enemies');
    expect(auraText({ id: 'c', name: 'C' }, names)).toBeUndefined();
  });

  it('turns an effect into an aura and back', () => {
    const e = { id: 'a', name: 'A' };
    const aura = setAura(e, { radius: 15 });
    expect(aura.aura).toEqual({ radius: 15, who: 'allies' });
    expect(setAura(aura, { who: 'all' }).aura).toEqual({ radius: 15, who: 'all' });
    expect(setAura(aura, { radius: 0 }).aura).toBeUndefined();
  });
});
