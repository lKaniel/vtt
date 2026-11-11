import { describe, expect, it } from 'vitest';
import type { Actor, TokenView } from '@vtt/system-dnd5e';
import { Sheets } from './session-sheets.ts';

function sheets(edits = true) {
  let changes = 0;
  const host = {
    tokens: new Map([
      ['bram', {} as TokenView],
      ['orrin', {} as TokenView],
    ]),
    actors: new Map([['wolf', {} as Actor]]),
    isGm: () => edits,
    canEdit: () => edits,
  };
  const part = new Sheets(host, { changed: () => changes++ });
  return { part, host, changes: () => changes };
}

describe('open sheets', () => {
  it('keeps several open at once, the last opened in front', () => {
    const { part } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'token', id: 'orrin' });
    expect(part.list.map((s) => s.id)).toEqual(['bram', 'orrin']);
    expect(part.current?.id).toBe('orrin');
  });

  it('brings a sheet already open to the front instead of opening it twice', () => {
    const { part } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'token', id: 'orrin' });
    part.open({ kind: 'token', id: 'bram' }, true);
    expect(part.list.map((s) => s.id)).toEqual(['orrin', 'bram']);
    expect(part.current).toEqual({ kind: 'token', id: 'bram', edit: true });
  });

  it('asks a sheet for a level up in a class dropped on it, out of edit mode, until it is done', () => {
    const { part } = sheets();
    part.open({ kind: 'token', id: 'bram' }, true);
    part.askLevelUp({ kind: 'token', id: 'bram' }, 'wizard');
    expect(part.current).toEqual({ kind: 'token', id: 'bram', edit: false, levelUp: 'wizard' });
    part.askLevelUp({ kind: 'token', id: 'bram' }, undefined);
    expect(part.current).toEqual({ kind: 'token', id: 'bram', edit: false });
  });

  it('closes one sheet and leaves the others', () => {
    const { part, changes } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'actor', id: 'wolf' });
    part.shut({ kind: 'token', id: 'bram' });
    expect(part.list).toEqual([{ kind: 'actor', id: 'wolf', edit: false }]);
    expect(changes()).toBe(3);
    expect(part.isOpen({ kind: 'token', id: 'bram' })).toBe(false);
  });

  it('closes the front sheet when asked to open none', () => {
    const { part } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'token', id: 'orrin' });
    part.open(undefined);
    expect(part.current?.id).toBe('bram');
  });

  it('switches one sheet to editing, by default the front one', () => {
    const { part } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'token', id: 'orrin' });
    part.setEdit(true, { kind: 'token', id: 'bram' });
    expect(part.list.map((s) => s.edit)).toEqual([true, false]);
    part.setEdit(true);
    expect(part.list.map((s) => s.edit)).toEqual([true, true]);
  });

  it('drops the sheets of creatures that are gone after a welcome', () => {
    const { part, host } = sheets();
    part.open({ kind: 'token', id: 'bram' });
    part.open({ kind: 'token', id: 'orrin' });
    host.tokens.delete('bram');
    part.reopen();
    expect(part.list.map((s) => s.id)).toEqual(['orrin']);
  });
});
