import { describe, expect, it } from 'vitest';
import { type Combat, currentTurn, joinCombat, leaveCombat, nextTurn, startCombat } from './index.ts';
import type { Rng } from '@vtt/shared';

/** An rng that returns the given d20 faces in order. */
function d20s(...faces: number[]): Rng {
  const queue = faces.map((f) => (f - 1) / 20);
  return () => queue.shift() ?? 0;
}

const speeds: Record<string, number> = { hero: 30, goblin: 30, wolf: 40 };
const fighters = [
  { token: 'hero', bonus: 2, speed: 30 },
  { token: 'goblin', bonus: 2, speed: 30 },
  { token: 'wolf', bonus: 3, speed: 40 },
];
const everyone = (id: string) => ({ speed: speeds[id] ?? 30, active: true });

describe('startCombat', () => {
  it('rolls initiative and sorts highest first, ties going to the higher bonus', () => {
    const c = startCombat(fighters, d20s(10, 15, 9));
    expect(c.order).toEqual([
      { token: 'goblin', initiative: 17 },
      { token: 'wolf', initiative: 12 },
      { token: 'hero', initiative: 12 },
    ]);
    expect(c).toMatchObject({ round: 1, turn: 0, left: { move: 30, action: true, bonus: true } });
    expect(currentTurn(c)).toBe('goblin');
  });
});

describe('nextTurn', () => {
  const start = (): Combat => startCombat(fighters, d20s(10, 15, 9));

  it('passes the turn on, refreshing movement and actions', () => {
    const c = nextTurn(
      { ...start(), left: { move: 0, action: false, bonus: false, attacks: 1, used: ['x'] } },
      everyone,
    );
    expect(currentTurn(c)).toBe('wolf');
    expect(c.left).toEqual({ move: 40, action: true, bonus: true, attacks: 0, used: [] });
  });

  it('starts a new round after the last creature', () => {
    const c = nextTurn(nextTurn(nextTurn(start(), everyone), everyone), everyone);
    expect(c).toMatchObject({ round: 2, turn: 0 });
  });

  it('skips creatures that are down', () => {
    const c = nextTurn(start(), (id) => ({ speed: 30, active: id !== 'wolf' }));
    expect(currentTurn(c)).toBe('hero');
  });
});

describe('leaveCombat', () => {
  it('removes a creature and keeps the current turn on the same creature', () => {
    const c = nextTurn(startCombat(fighters, d20s(10, 15, 9)), everyone);
    const after = leaveCombat(c, 'goblin', everyone);
    expect(after.order.map((e) => e.token)).toEqual(['wolf', 'hero']);
    expect(currentTurn(after)).toBe('wolf');
  });

  it('passes the turn on when the current creature leaves', () => {
    const c = leaveCombat(startCombat(fighters, d20s(10, 15, 9)), 'goblin', everyone);
    expect(currentTurn(c)).toBe('wolf');
    expect(c.left.move).toBe(40);
  });
});

describe('joinCombat', () => {
  it('puts summons right after their caster, keeping whose turn it is', () => {
    const c = nextTurn(startCombat(fighters, d20s(10, 15, 9)), everyone);
    const after = joinCombat(c, 'goblin', ['owl']);
    expect(after.order.map((e) => e.token)).toEqual(['goblin', 'owl', 'wolf', 'hero']);
    expect(currentTurn(after)).toBe('wolf');
  });
});
