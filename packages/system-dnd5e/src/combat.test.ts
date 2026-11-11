import { describe, expect, it } from 'vitest';
import {
  addToCombat,
  type Combat,
  currentTurn,
  joinCombat,
  leaveCombat,
  nextTurn,
  moveInOrder,
  previousTurn,
  setInitiative,
  setRound,
  turnTo,
  startCombat,
  turnLeft,
} from './index.ts';
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

describe('addToCombat', () => {
  const base: Combat = {
    round: 1,
    turn: 1,
    order: [
      { token: 'a', initiative: 18 },
      { token: 'b', initiative: 12 },
      { token: 'c', initiative: 5 },
    ],
    left: { move: 30, action: true, bonus: true, attacks: 0, used: [] },
    reacted: [],
    side: {},
  };

  it('rolls initiative and takes its place, keeping whose turn it is', () => {
    // A d20 of 16 (0.75), +4: 20 goes first, before the creature acting now.
    const first = addToCombat(base, { token: 'd', bonus: 4, speed: 30 }, () => 0.75);
    expect(first.order.map((e) => e.token)).toEqual(['d', 'a', 'b', 'c']);
    expect(currentTurn(first)).toBe('b');
    const last = addToCombat(base, { token: 'e', bonus: 0, speed: 30 }, () => 0);
    expect(last.order.map((e) => e.token)).toEqual(['a', 'b', 'c', 'e']);
    expect(currentTurn(last)).toBe('b');
  });

  it('leaves a creature already in the fight where it is', () => {
    expect(addToCombat(base, { token: 'a', bonus: 0, speed: 30 }, () => 0)).toBe(base);
  });
});

describe('setInitiative', () => {
  const base: Combat = {
    round: 1,
    turn: 1,
    order: [
      { token: 'a', initiative: 18 },
      { token: 'b', initiative: 12 },
      { token: 'c', initiative: 5 },
    ],
    left: { move: 30, action: true, bonus: true, attacks: 0, used: [] },
    reacted: [],
    side: {},
  };

  it('moves the creature to its new place and keeps the turn with whoever has it', () => {
    const after = setInitiative(base, 'c', 20);
    expect(after.order).toEqual([
      { token: 'c', initiative: 20 },
      { token: 'a', initiative: 18 },
      { token: 'b', initiative: 12 },
    ]);
    expect(currentTurn(after)).toBe('b');
  });

  it('moves the creature whose turn it is, and its turn goes on', () => {
    const after = setInitiative(base, 'b', 1);
    expect(after.order.map((e) => e.token)).toEqual(['a', 'c', 'b']);
    expect(currentTurn(after)).toBe('b');
  });

  it('leaves a fight without the creature as it is', () => {
    expect(setInitiative(base, 'zz', 3)).toBe(base);
  });
});

describe('turnLeft', () => {
  it('gives the budget of whoever acts, and everyone’s reaction', () => {
    const left = { move: 10, action: false, bonus: true, attacks: 0, used: [] };
    const side = { ...left, move: 30 };
    const fight = {
      round: 1,
      turn: 0,
      order: [
        { token: 'a', initiative: 2 },
        { token: 'b', initiative: 1 },
      ],
      left,
      side: { wolf: side },
      reacted: ['b'],
    };
    expect(turnLeft(fight, 'a')).toEqual({ budget: left, reaction: true });
    expect(turnLeft(fight, 'b')).toEqual({ budget: undefined, reaction: false });
    expect(turnLeft(fight, 'wolf')).toEqual({ budget: side, reaction: true });
    expect(turnLeft(fight, 'nobody')).toBeUndefined();
  });
});

describe('the GM running the order by hand', () => {
  const base: Combat = {
    round: 2,
    turn: 1,
    order: [
      { token: 'a', initiative: 18 },
      { token: 'b', initiative: 12 },
      { token: 'c', initiative: 5 },
    ],
    left: { move: 5, action: false, bonus: false, attacks: 0, used: ['sneak-attack'] },
    reacted: ['c'],
    side: { pet: { move: 0, action: false, bonus: true, attacks: 0, used: [] } },
  };
  const info = (id: string) => ({ speed: id === 'c' ? 40 : 30, active: id !== 'a' });

  it('turnTo gives a creature a fresh turn in the same round, even one that is down', () => {
    const after = turnTo(base, 'c', info);
    expect(currentTurn(after)).toBe('c');
    expect(after.round).toBe(2);
    expect(after.left).toEqual({ move: 40, action: true, bonus: true, attacks: 0, used: [] });
    expect(after.reacted).toEqual([]);
    expect(after.side).toEqual({});
    expect(currentTurn(turnTo(base, 'a', info))).toBe('a');
  });

  it('turnTo starts the turn over for the creature that has it', () => {
    expect(turnTo(base, 'b', info).left.action).toBe(true);
  });

  it('turnTo takes in the party members sharing the turn', () => {
    const party = (id: string) => ({ speed: 30, active: true, party: id !== 'a' });
    const after = turnTo({ ...base, shared: true, group: ['x'], done: ['x'] }, 'b', party);
    expect(after.group).toEqual(['c']);
    expect(after.done).toBeUndefined();
  });

  it('turnTo leaves a fight without the creature as it is', () => {
    expect(turnTo(base, 'zz', info)).toBe(base);
  });

  it('previousTurn steps back to the creature before, skipping those that are down', () => {
    const back = previousTurn({ ...base, turn: 2 }, info);
    expect(currentTurn(back)).toBe('b');
    expect(back.round).toBe(2);
  });

  it('previousTurn goes back a round past the top of the order, but never before round 1', () => {
    const back = previousTurn(base, info);
    expect(currentTurn(back)).toBe('c');
    expect(back.round).toBe(1);
    expect(previousTurn({ ...base, round: 1 }, info).round).toBe(1);
  });

  it('setRound changes only the round', () => {
    expect(setRound(base, 7)).toEqual({ ...base, round: 7 });
  });

  it('moveInOrder swaps a creature with its neighbour, taking its initiative, and the turn stays', () => {
    const up = moveInOrder(base, 'c', -1);
    expect(up.order).toEqual([
      { token: 'a', initiative: 18 },
      { token: 'c', initiative: 12 },
      { token: 'b', initiative: 12 },
    ]);
    expect(currentTurn(up)).toBe('b');
    const down = moveInOrder(base, 'b', 1);
    expect(down.order.map((e) => e.token)).toEqual(['a', 'c', 'b']);
    expect(down.order[2]!.initiative).toBe(5);
    expect(currentTurn(down)).toBe('b');
  });

  it('moveInOrder stops at the ends', () => {
    expect(moveInOrder(base, 'a', -1)).toBe(base);
    expect(moveInOrder(base, 'c', 1)).toBe(base);
  });
});
