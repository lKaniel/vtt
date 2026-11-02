import { describe, expect, it } from 'vitest';
import { diceToThrow, diceForMessage, rollsIn } from './dice-throw.ts';

const term = (text: string, rolls: number[]) => ({
  text,
  sign: 1 as const,
  rolls,
  kept: rolls.map(() => true),
  value: 0,
});
const roll = (...terms: ReturnType<typeof term>[]) => ({ formula: '', terms, total: 0 });

describe('3D dice', () => {
  it('finds every roll on a chat card, however deep', () => {
    const attack = roll(term('1d20', [17]));
    const damage = roll(term('2d6', [3, 5]), term('+3', []));
    const message = {
      id: '1',
      time: 0,
      from: 'GM',
      color: '#fff',
      attack: { roll: attack, parts: [{ roll: damage }] },
    };
    expect(rollsIn(message)).toEqual([attack, damage]);
    expect(rollsIn({ id: '2', time: 0, from: 'Ana', color: '#fff', text: 'hi' })).toEqual([]);
  });

  it('throws one die per roll of a d4, d6, d8, d10, d12 or d20, labelled 1 to n, face down at the result', () => {
    const dice = diceToThrow([roll(term('2d20kh1', [4, 19]), term('1d6', [6]), term('1d3', [2]))]);
    expect(dice.map((d) => [d.sides, d.face])).toEqual([
      [20, 3],
      [20, 18],
      [6, 5],
    ]);
    expect(dice[2]!.labels).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('throws a d100 as a tens die and a ones die', () => {
    const [tens, ones] = diceToThrow([roll(term('1d100', [100]))]);
    expect(tens).toMatchObject({ sides: 10, face: 9 });
    expect(tens!.labels[9]).toBe('90');
    expect(ones).toMatchObject({ sides: 10, face: 9 });
    const [t2, o2] = diceToThrow([roll(term('1d100', [7]))]);
    expect([t2!.labels[t2!.face], o2!.labels[o2!.face]]).toEqual(['00', '7']);
  });

  it('throws a dozen at most', () => {
    expect(
      diceToThrow([
        roll(
          term(
            '20d6',
            Array.from({ length: 20 }, () => 1),
          ),
        ),
      ]),
    ).toHaveLength(12);
  });
});

describe('when dice are thrown', () => {
  const card = { id: 'c', time: 0, from: 'Ana', color: '#a33', roll: roll(term('1d20', [12])) };

  it('throws a card’s dice once, if the player wants 3D dice and animations', () => {
    const seen = new Set<string>();
    expect(diceForMessage(card, { dice: 'on', motion: 'full' }, seen)).toHaveLength(1);
    expect(diceForMessage(card, { dice: 'on', motion: 'full' }, seen)).toEqual([]);
    expect(diceForMessage({ ...card, id: 'd' }, { dice: 'off', motion: 'full' }, seen)).toEqual([]);
    expect(diceForMessage({ ...card, id: 'e' }, { dice: 'on', motion: 'off' }, seen)).toEqual([]);
    expect(diceForMessage({ ...card, id: 'f', hidden: true }, { dice: 'on', motion: 'full' }, seen)).toEqual([]);
  });
});
