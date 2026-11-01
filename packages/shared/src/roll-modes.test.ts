import { describe, expect, it } from 'vitest';
import type { ChatEntry } from './protocol.ts';
import { chatFor, rollModeOf, withMode } from './roll-modes.ts';

const gm = { id: 'gm', role: 'gm' as const };
const ana = { id: 'ana', role: 'player' as const };
const bo = { id: 'bo', role: 'player' as const };

const roll = { formula: '1d20', total: 12, terms: [] };
const base: ChatEntry = { id: 'm', time: 1, from: 'Ana', color: '#fff', by: 'ana', roll };

describe('roll modes', () => {
  it('show a public roll to everyone', () => {
    for (const p of [gm, ana, bo]) expect(chatFor(base, p)).toEqual(base);
  });

  it('show a GM roll to the GM and whoever rolled it', () => {
    const m = { ...base, mode: 'gm' as const };
    expect(chatFor(m, gm)).toEqual(m);
    expect(chatFor(m, ana)).toEqual(m);
    expect(chatFor(m, bo)).toBeUndefined();
  });

  it('show a GM card nobody rolled to the GM only', () => {
    const m: ChatEntry = { id: 'c', time: 1, from: 'Combat', color: '#fff', text: 'A lever', mode: 'gm' };
    expect(chatFor(m, gm)).toEqual(m);
    expect(chatFor(m, ana)).toBeUndefined();
  });

  it('show a blind roll to the GM, and only that a roll was made to whoever rolled it', () => {
    const m = { ...base, mode: 'blind' as const, attack: { secret: 1 } };
    expect(chatFor(m, gm)).toEqual(m);
    expect(chatFor(m, ana)).toEqual({
      id: 'm',
      time: 1,
      from: 'Ana',
      color: '#fff',
      by: 'ana',
      mode: 'blind',
      hidden: true,
    });
    expect(chatFor(m, bo)).toBeUndefined();
  });

  it('show a self roll to whoever rolled it only', () => {
    const m = { ...base, mode: 'self' as const };
    expect(chatFor(m, ana)).toEqual(m);
    expect(chatFor(m, gm)).toBeUndefined();
    expect(chatFor(m, bo)).toBeUndefined();
  });

  it('read a roll mode from the chat commands, else the seat’s own', () => {
    expect(rollModeOf('/r', 'public')).toBe('public');
    expect(rollModeOf('/r', 'blind')).toBe('blind');
    expect(rollModeOf('/gmr', 'public')).toBe('gm');
    expect(rollModeOf('/br', 'public')).toBe('blind');
    expect(rollModeOf('/blindroll', 'self')).toBe('blind');
    expect(rollModeOf('/sr', 'public')).toBe('self');
    expect(rollModeOf('/pr', 'gm')).toBe('public');
    expect(rollModeOf('/say', 'gm')).toBeUndefined();
  });

  it('mark a message with who made it and how it was rolled', () => {
    expect(withMode(base, 'public', 'ana')).toEqual(base);
    expect(withMode({ ...base, by: undefined }, 'gm', 'ana')).toEqual({ ...base, mode: 'gm' });
  });
});
