import { describe, expect, it } from 'vitest';
import { actsNow, type Combat, currentTurn, endTurns, firstTurn, freshTurn, leaveCombat, nextTurn } from './index.ts';

// BG3's shared party turns: party members next to each other in the order
// act on one turn, in any order, and it passes on when they have all ended.

const party = new Set(['ana', 'bo', 'cy']);
const info = (id: string) => ({ speed: 30, active: id !== 'down', party: party.has(id) || id === 'down' });

const fight = (tokens: string[], shared = true): Combat => ({
  round: 1,
  turn: 0,
  order: tokens.map((token, i) => ({ token, initiative: 20 - i })),
  left: freshTurn(30),
  side: {},
  reacted: [],
  ...(shared && { shared }),
});

describe('shared party turns', () => {
  it('lets the party members next in the order act on the same turn', () => {
    const c = firstTurn(fight(['ana', 'bo', 'goblin', 'cy']), info);
    expect(currentTurn(c)).toBe('ana');
    expect(c.group).toEqual(['bo']);
    expect(actsNow(c, 'bo')).toBe(true);
    expect(actsNow(c, 'goblin')).toBe(false);
  });

  it('is off unless the fight shares turns', () => {
    const c = firstTurn(fight(['ana', 'bo', 'goblin'], false), info);
    expect(c.group).toBeUndefined();
    expect(actsNow(c, 'bo')).toBe(false);
  });

  it('starts with the party when a foe is first, and skips members who are down', () => {
    let c = firstTurn(fight(['goblin', 'ana', 'down', 'bo', 'wolf', 'cy']), info);
    expect(c.group).toBeUndefined();
    c = nextTurn(c, info);
    expect(currentTurn(c)).toBe('ana');
    expect(c.group).toEqual(['bo']);
  });

  it('passes on once every member has ended their turn, in any order', () => {
    let c = firstTurn(fight(['ana', 'bo', 'goblin', 'cy']), info);
    c = endTurns(c, ['bo'], info);
    expect(currentTurn(c)).toBe('ana');
    expect(actsNow(c, 'bo')).toBe(false);
    expect(actsNow(c, 'ana')).toBe(true);
    c = endTurns(c, ['ana'], info);
    expect(currentTurn(c)).toBe('goblin');
    expect(c.group).toBeUndefined();
    c = nextTurn(c, info);
    expect(currentTurn(c)).toBe('cy');
    expect(c.group).toBeUndefined();
    c = nextTurn(c, info);
    expect([c.round, currentTurn(c), c.group]).toEqual([2, 'ana', ['bo']]);
  });

  it('ends a turn the usual way when no one shares it', () => {
    const c = endTurns(firstTurn(fight(['goblin', 'ana']), info), ['goblin'], info);
    expect(currentTurn(c)).toBe('ana');
  });

  it('drops a member who leaves the fight from the shared turn', () => {
    const c = leaveCombat(firstTurn(fight(['ana', 'bo', 'cy', 'goblin']), info), 'bo', info);
    expect(c.group).toEqual(['cy']);
    expect(leaveCombat(c, 'cy', info).group).toBeUndefined();
  });
});
