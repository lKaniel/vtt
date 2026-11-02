import { describe, expect, it, vi } from 'vitest';
import { Popouts, popoutFeatures } from './popouts.ts';

describe('sheets in their own windows', () => {
  it('keeps each popped-out sheet once, with its own edit mode, until closed', () => {
    const p = new Popouts();
    const seen = vi.fn();
    p.subscribe(seen);
    p.open({ kind: 'token', id: 'bram' }, true);
    p.open({ kind: 'token', id: 'bram' });
    p.open({ kind: 'actor', id: 'goblin' });
    expect(p.list).toEqual([
      { kind: 'token', id: 'bram', edit: true },
      { kind: 'actor', id: 'goblin', edit: false },
    ]);
    p.setEdit({ kind: 'actor', id: 'goblin' }, true);
    expect(p.list[1]?.edit).toBe(true);
    p.close({ kind: 'token', id: 'bram' });
    expect(p.list.map((s) => s.id)).toEqual(['goblin']);
    expect(seen).toHaveBeenCalledTimes(4);
  });

  it('asks the browser for a plain window of the sheet’s size', () => {
    expect(popoutFeatures()).toBe('popup,width=1040,height=780');
  });
});
