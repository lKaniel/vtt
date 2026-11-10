import { describe, expect, it } from 'vitest';
import type { Attack, Spell } from '@vtt/system-dnd5e';
import type { Wall } from '@vtt/shared';
import { attackGoal, closeIn, spellGoal, type CloseInScene } from './close-in.ts';

// Walking into range before an attack or a cast, as in BG3 (close-in.ts).

const g = 100;
const scene = (over: Partial<CloseInScene> = {}): CloseInScene => ({
  gridSize: g,
  grid: 'none',
  walls: [],
  walk: { gridSize: g, gridless: true, radius: g / 2, bodies: [] },
  budget: Infinity,
  ...over,
});
const hero = { id: 'hero', x: 50, y: 50, size: 1 };
const sword = { name: 'Longsword', kind: 'melee', toHit: 5, damage: [] } as unknown as Attack;
const bow = { name: 'Shortbow', kind: 'ranged', toHit: 5, range: [80, 320], damage: [] } as unknown as Attack;
const spell = (over: Partial<Spell>) => ({ id: 's', name: 'Spell', range: 60, ...over }) as unknown as Spell;

describe('closeIn', () => {
  it('stays put when the target is in reach already', () => {
    const goblin = { x: 150, y: 50, size: 1 };
    expect(closeIn(hero, attackGoal(sword, goblin, scene()), scene())).toEqual({ kind: 'here' });
  });

  it('walks a melee attacker up next to its target', () => {
    const goblin = { x: 1050, y: 50, size: 1 };
    const plan = closeIn(hero, attackGoal(sword, goblin, scene()), scene());
    expect(plan.kind).toBe('walk');
    if (plan.kind !== 'walk') return;
    expect(plan.to[1]).toBeCloseTo(50);
    // It stops as soon as the goblin is within 5 ft: half a square of slack without a grid.
    expect(plan.to[0]).toBeGreaterThan(870);
    expect(plan.to[0]).toBeLessThan(960);
  });

  it('goes round a friend standing on the near side of the target', () => {
    const goblin = { x: 1050, y: 50, size: 1 };
    const s = scene({
      walk: {
        gridSize: g,
        gridless: true,
        radius: g / 2,
        bodies: [
          { x: 950, y: 50, r: 50 },
          { x: 1050, y: 50, r: 50 },
        ],
      },
    });
    const plan = closeIn(hero, attackGoal(sword, goblin, s), s);
    expect(plan.kind).toBe('walk');
    if (plan.kind === 'walk') expect(Math.hypot(plan.to[0] - 950, plan.to[1] - 50)).toBeGreaterThanOrEqual(99);
  });

  it('walks an archer only as far as its normal range', () => {
    const goblin = { x: 50 + 70 * g, y: 50, size: 1 };
    const plan = closeIn(hero, attackGoal(bow, goblin, scene()), scene());
    expect(plan.kind).toBe('walk');
    if (plan.kind !== 'walk') return;
    // 80 ft is 16 squares: it stops about 16 squares short of the goblin, not next to it.
    expect(goblin.x - plan.to[0]).toBeGreaterThan(14 * g);
    expect(goblin.x - plan.to[0]).toBeLessThan(17 * g);
  });

  it('shoots from long range without walking', () => {
    const goblin = { x: 50 + 20 * g, y: 50, size: 1 };
    expect(closeIn(hero, attackGoal(bow, goblin, scene()), scene())).toEqual({ kind: 'here' });
  });

  it('walks round a wall until it has a clear shot', () => {
    const wall: Wall = { id: 'w', a: [300, -1000], b: [300, 400] };
    const s = scene({ walls: [wall] });
    const goblin = { x: 450, y: 50, size: 1 };
    const plan = closeIn(hero, attackGoal(bow, goblin, s), s);
    expect(plan.kind).toBe('walk');
    if (plan.kind === 'walk') expect(plan.to[1]).toBeGreaterThan(400);
  });

  it('refuses a walk longer than the movement left in the fight', () => {
    const goblin = { x: 1050, y: 50, size: 1 };
    const plan = closeIn(hero, attackGoal(sword, goblin, scene()), scene({ budget: 30 }));
    expect(plan).toMatchObject({ kind: 'tooFar', budget: 30 });
  });

  it('brings every creature a spell targets into range', () => {
    const a = { x: 50 + 10 * g, y: 50, size: 1 };
    const b = { x: 50 + 10 * g, y: 50 + 6 * g, size: 1 };
    const plan = closeIn(hero, spellGoal(spell({ range: 30 }), { targets: [a, b] }, scene()), scene());
    expect(plan.kind).toBe('walk');
    if (plan.kind !== 'walk') return;
    const feet = (t: typeof a) => (Math.hypot(t.x - plan.to[0], t.y - plan.to[1]) / g) * 5;
    expect(feet(a)).toBeLessThanOrEqual(40);
    expect(feet(b)).toBeLessThanOrEqual(40);
  });

  it('walks a touch spell up to its target', () => {
    const ally = { x: 50 + 5 * g, y: 50, size: 1 };
    const plan = closeIn(hero, spellGoal(spell({ range: 0 }), { targets: [ally] }, scene()), scene());
    expect(plan.kind).toBe('walk');
  });

  it('walks a spell aimed at a point until the point is in range', () => {
    const plan = closeIn(hero, spellGoal(spell({ range: 30 }), { point: [50 + 12 * g, 50] }, scene()), scene());
    expect(plan.kind).toBe('walk');
    if (plan.kind === 'walk') expect(plan.to[0]).toBeGreaterThan(50 + 5 * g);
  });

  it('never walks for a spell centred on the caster or a teleport', () => {
    const far = { point: [50 + 30 * g, 50] as [number, number] };
    expect(closeIn(hero, spellGoal(spell({ range: 0, area: {} as never }), far, scene()), scene()).kind).toBe('here');
    expect(closeIn(hero, spellGoal(spell({ teleport: 30 }), far, scene()), scene()).kind).toBe('here');
  });
});
