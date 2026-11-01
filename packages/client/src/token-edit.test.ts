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
  it('sets one player’s level, or everyone’s default', () => {
    const t = { ownership: { default: 'limited' as const, ana: 'owner' as const, bo: 'observer' as const } };
    expect(setOwnership(t, 'bo', 'owner').ownership).toEqual({ default: 'limited', ana: 'owner', bo: 'owner' });
    expect(setOwnership(t, 'bo', 'limited').ownership).toEqual({ default: 'limited', ana: 'owner' });
    expect(setOwnership(t, 'default', 'none').ownership).toEqual({ default: 'none', ana: 'owner', bo: 'observer' });
  });

  it('leaves a document that says nothing special without ownership', () => {
    expect(
      setOwnership({ ownership: { default: 'limited' as const, ana: 'owner' as const } }, 'ana', 'limited'),
    ).toEqual({});
    expect(setOwnership({}, 'ana', 'owner')).toEqual({ ownership: { default: 'limited', ana: 'owner' } });
  });
});
