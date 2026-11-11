import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { TokenSchema } from './token-schema.ts';
import { adviseTurn, averageDamage, hitChance, type AdviceFighter } from './turn-advice.ts';

// The GM's turn helper: on a monster's turn, the attack and the target it
// does best with, from where it stands or after walking with what it has
// left. The GM sees it and takes it with one click (or doesn't).

const GRID = 100;
const book = srdFor('2014');

/** A creature standing on square (col, row). */
function fighter(id: string, col: number, row: number, data: object): AdviceFighter {
  const token = TokenSchema.parse({ id, name: id, x: (col + 0.5) * GRID, y: (row + 0.5) * GRID, ...data });
  return { ...token, sheet: resolveCreature(token, book)! };
}

const orc = (col = 0, row = 0) => fighter('orc', col, row, { monster: 'orc' });
const hero = (id: string, col: number, row: number, extra: object = {}) =>
  fighter(id, col, row, {
    ownership: { ana: 'owner' },
    stats: { class: 'fighter', level: 3, maxHp: 28, abilities: { str: 16, dex: 12, con: 14 } },
    ...extra,
  });
const scene = { gridSize: GRID, grid: 'square' as const, walk: 30 };

describe('the turn helper', () => {
  it('reads the chance to hit like the d20 does: 1 misses, 20 hits', () => {
    expect(hitChance(5, 15)).toBeCloseTo(0.55);
    expect(hitChance(5, 30)).toBeCloseTo(0.05);
    expect(hitChance(15, 10)).toBeCloseTo(0.95);
  });

  it('averages damage, after resistance and immunity', () => {
    const axe = orc().sheet.attacks.find((a) => a.name === 'Greataxe')!;
    const plain = { resistances: [], immunities: [], vulnerabilities: [] };
    expect(averageDamage(axe, plain)).toBeCloseTo(9.5);
    expect(averageDamage(axe, { ...plain, resistances: ['slashing' as const] })).toBeCloseTo(4.75);
    expect(averageDamage(axe, { ...plain, immunities: ['slashing' as const] })).toBe(0);
  });

  it('swings its best weapon at a foe beside it', () => {
    const advice = adviseTurn(orc(), [hero('bram', 1, 0)], scene);
    expect(advice).toMatchObject({ attack: 'Greataxe', target: 'bram', walks: false });
    expect(advice!.expected).toBeGreaterThan(4);
  });

  it('walks up to a foe it can reach this turn, and throws at one it can’t', () => {
    expect(adviseTurn(orc(), [hero('bram', 5, 0)], scene)).toMatchObject({ attack: 'Greataxe', walks: true });
    expect(adviseTurn(orc(), [hero('bram', 15, 0)], scene)).toMatchObject({
      attack: 'Javelin (thrown)',
      walks: false,
    });
  });

  it('goes for the foe a hit would drop', () => {
    const fresh = hero('bram', 1, 0);
    const hurt = hero('cora', 0, 1, { hp: 4 });
    expect(adviseTurn(orc(), [fresh, hurt], scene)).toMatchObject({ target: 'cora', drops: true });
  });

  it('leaves its own side, the fallen, and foes out of reach alone', () => {
    const friend = fighter('ally', 1, 0, { monster: 'orc' });
    const down = hero('bram', 0, 1, { hp: 0 });
    const far = hero('cora', 60, 0);
    expect(adviseTurn(orc(), [friend, down, far], scene)).toBeUndefined();
  });

  it('a creature of the party fights the monsters', () => {
    const goblin = fighter('gob', 1, 0, { monster: 'goblin' });
    expect(adviseTurn(hero('bram', 0, 0), [goblin], scene)).toMatchObject({ target: 'gob' });
  });
});
