import { describe, expect, it } from 'vitest';
import { listText, parseList, setAbility, setOwnership, setStat, tokenPatch } from './token-edit.ts';

describe('the GM token editor', () => {
  it('sends only what changed, and null for what was cleared', () => {
    const before = { id: 'g', name: 'Goblin', hp: 3, speed: 30, stats: { level: 2 }, sheet: { ac: 15 } };
    const after = { id: 'g', name: 'Snik', speed: 30, stats: { level: 3 }, sheet: { ac: 15 } };
    expect(tokenPatch(before, after)).toEqual({ name: 'Snik', hp: null, stats: { level: 3 } });
    expect(tokenPatch(before, before)).toEqual({});
  });

  it('drops empty stats and abilities instead of writing blanks', () => {
    expect(setStat({ name: 'a', stats: { level: 2 } }, 'level', undefined)).toEqual({ name: 'a' });
    expect(setStat({ name: 'a' }, 'class', 'Wizard')).toEqual({ name: 'a', stats: { class: 'Wizard' } });
    expect(setAbility({ stats: { abilities: { str: 12 } } }, 'str', undefined)).toEqual({});
    expect(setAbility({}, 'dex', 14)).toEqual({ stats: { abilities: { dex: 14 } } });
  });

  it('reads damage type lists typed with commas, keeping only real types', () => {
    expect(parseList('Fire, cold ,  , banana')).toEqual(['fire', 'cold']);
    expect(listText(['fire', 'cold'])).toBe('fire, cold');
  });
});

describe('ownership in the editor', () => {
  it('moves a player between owner, observer and none', () => {
    const t = { controllers: ['ana'], observers: ['bo'] };
    expect(setOwnership(t, 'bo', 'owner')).toEqual({ controllers: ['ana', 'bo'] });
    expect(setOwnership(t, 'ana', 'observer')).toEqual({ controllers: [], observers: ['bo', 'ana'] });
    expect(setOwnership(t, 'bo', 'none')).toEqual({ controllers: ['ana'] });
  });
});
