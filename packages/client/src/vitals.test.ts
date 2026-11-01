import type { Effect, TokenView } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { effectTone, hpBar } from './vitals.ts';

const token = (t: Partial<TokenView>): TokenView => ({
  id: 'a',
  name: 'Bram Stoutbeard',
  x: 0,
  y: 0,
  size: 1,
  color: '#a33',
  speed: 30,
  darkvision: 0,
  hidden: false,
  ...t,
});

const sheet = (hp: number, maxHp: number) => ({ hp, maxHp }) as TokenView['sheet'];

describe('health bars', () => {
  it('shows exact hit points when you can see the sheet', () => {
    expect(hpBar(token({ sheet: sheet(15, 20) }))).toEqual({ percent: 75, tone: 'hurt', label: '15/20' });
    expect(hpBar(token({ sheet: sheet(20, 20) }))).toMatchObject({ tone: 'unhurt' });
    expect(hpBar(token({ sheet: sheet(-3, 20) }))).toEqual({ percent: 0, tone: 'down', label: '0/20' });
  });

  it('adds temporary hit points to the label', () => {
    const shielded = { ...sheet(15, 20), tempHp: 8 } as TokenView['sheet'];
    expect(hpBar(token({ sheet: shielded }))).toMatchObject({ percent: 75, label: '15/20 +8' });
  });

  it('shows death saves on a downed character', () => {
    const down = (deathSaves: TokenView['deathSaves']) => hpBar(token({ sheet: sheet(0, 20), deathSaves }))?.label;
    expect(down({ successes: 1, failures: 2 })).toBe('Dying: 1 ✓ 2 ✗');
    expect(down({ successes: 3, failures: 0, stable: true })).toBe('Stable');
    expect(down({ successes: 0, failures: 3, dead: true })).toBe('Dead');
  });

  it('estimates from how hurt it looks otherwise', () => {
    expect(hpBar(token({ health: 'bloodied' }))).toEqual({ percent: 35, tone: 'bloodied', label: 'Bloodied' });
    expect(hpBar(token({ health: 'unhurt' }))).toMatchObject({ percent: 100 });
  });

  it('has nothing to show for creatures without stats', () => {
    expect(hpBar(token({}))).toBeUndefined();
  });
});

describe('effects', () => {
  const effect = (e: Partial<Effect>): Effect => ({ id: 'e', name: 'E', ...e });

  it('calls conditions and penalties harmful, the rest helpful', () => {
    expect(effectTone(effect({ conditions: ['paralyzed'] }))).toBe('harmful');
    expect(effectTone(effect({ attackBonus: '-1d4' }))).toBe('harmful');
    expect(effectTone(effect({ advantageAgainst: true }))).toBe('harmful');
    expect(effectTone(effect({ disadvantage: true }))).toBe('harmful');
    expect(effectTone(effect({ speed: -10 }))).toBe('harmful');
    expect(effectTone(effect({ attackBonus: '1d4' }))).toBe('helpful');
    expect(effectTone(effect({ ac: 5 }))).toBe('helpful');
  });
});
