import type { Point } from '@vtt/shared';
import { describe, expect, it, vi } from 'vitest';
import { rulerLabels, Rulers } from './rulers.ts';

function board() {
  let now = 0;
  const sent: Point[][] = [];
  const changed = vi.fn();
  const timers: (() => void)[] = [];
  const rulers = new Rulers((msg) => sent.push(msg.points), changed, {
    interval: 50,
    now: () => now,
    later: (fn) => {
      timers.push(fn);
    },
  });
  return {
    rulers,
    sent,
    changed,
    wait: (ms: number) => {
      now += ms;
    },
    fire: () => timers.splice(0).forEach((fn) => fn()),
  };
}

describe('your ruler', () => {
  it('starts with a click, follows the pointer and adds a waypoint on each click', () => {
    const { rulers, sent, wait } = board();
    expect(rulers.active).toBe(false);
    rulers.hover([5, 5]);
    expect(sent).toEqual([]);
    rulers.press([0, 0]);
    wait(100);
    rulers.hover([100, 0]);
    expect(rulers.mine).toEqual([
      [0, 0],
      [100, 0],
    ]);
    rulers.press([100, 0]);
    wait(100);
    rulers.hover([100, 80.6]);
    expect(rulers.mine).toEqual([
      [0, 0],
      [100, 0],
      [100, 81],
    ]);
    expect(sent.at(-1)).toEqual(rulers.mine);
  });

  it('tells the table at most every 50 ms while the pointer moves, and where it ended up', () => {
    const { rulers, sent, wait, fire } = board();
    rulers.press([0, 0]);
    expect(sent).toHaveLength(1);
    wait(10);
    rulers.hover([10, 0]);
    rulers.hover([20, 0]);
    expect(sent).toHaveLength(1);
    wait(40);
    fire();
    expect(sent.at(-1)).toEqual([
      [0, 0],
      [20, 0],
    ]);
  });

  it('a right click takes back the last waypoint; with only the start left it puts the ruler away', () => {
    const { rulers, sent } = board();
    rulers.press([0, 0]);
    rulers.press([100, 0]);
    expect(rulers.back()).toBe(true);
    expect(rulers.mine).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect(rulers.back()).toBe(true);
    expect(rulers.active).toBe(false);
    expect(sent.at(-1)).toEqual([]);
    expect(rulers.back()).toBe(false);
  });

  it('is put away (and the table told) by clear, but not twice', () => {
    const { rulers, sent } = board();
    expect(rulers.clear()).toBe(false);
    rulers.press([0, 0]);
    expect(rulers.clear()).toBe(true);
    expect(sent.at(-1)).toEqual([]);
    expect(rulers.mine).toEqual([]);
  });
});

describe('the rulers of others', () => {
  it('shows each player’s ruler until they put it away, and forgets them all on a fresh start', () => {
    const { rulers, changed } = board();
    const ana = {
      t: 'ruler' as const,
      player: 'ana',
      name: 'Ana',
      color: '#f00',
      points: [[0, 0] as Point, [9, 9] as Point],
    };
    rulers.receive(ana);
    rulers.receive({ ...ana, player: 'bo', name: 'Bo' });
    expect([...rulers.others.keys()]).toEqual(['ana', 'bo']);
    rulers.receive({ ...ana, points: [] });
    expect([...rulers.others.keys()]).toEqual(['bo']);
    rulers.press([1, 1]);
    rulers.reset();
    expect(rulers.others.size).toBe(0);
    expect(rulers.active).toBe(false);
    expect(changed).toHaveBeenCalled();
  });
});

describe('ruler labels', () => {
  const measure = {
    points: [
      [0, 0],
      [300, 400],
      [300, 0],
    ] as Point[],
    legs: [],
    feet: 45,
    cost: 45,
  };

  it('says the distance so far at each waypoint and the total at the end', () => {
    const legs = [
      { from: [0, 0] as Point, to: [300, 400] as Point, feet: 25, cost: 25 },
      { from: [300, 400] as Point, to: [300, 0] as Point, feet: 20, cost: 20 },
    ];
    expect(rulerLabels({ ...measure, legs })).toEqual([
      { at: [300, 400], text: '25 ft', over: false },
      { at: [300, 0], text: '45 ft', over: false },
    ]);
  });

  it('adds what walking it costs across difficult ground, and how it compares to a speed', () => {
    const legs = [{ from: [0, 0] as Point, to: [300, 0] as Point, feet: 45, cost: 60 }];
    const m = {
      ...measure,
      points: [
        [0, 0],
        [300, 0],
      ] as Point[],
      legs,
      cost: 60,
    };
    expect(rulerLabels(m).at(-1)!.text).toBe('45 ft · 60 ft to walk');
    expect(rulerLabels(m, 30).at(-1)).toMatchObject({ text: '45 ft · 60 / 30 ft to walk', over: true });
    const plain = { ...m, legs: [{ ...legs[0]!, cost: 45 }], cost: 45 };
    expect(rulerLabels(plain, 60).at(-1)).toMatchObject({ text: '45 / 60 ft', over: false });
  });

  it('has nothing to say about a ruler that is just its start', () => {
    expect(rulerLabels({ points: [[0, 0]], legs: [], feet: 0, cost: 0 })).toEqual([]);
  });
});
