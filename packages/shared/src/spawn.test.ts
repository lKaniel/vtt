import { describe, expect, it } from 'vitest';
import {
  actorFromToken,
  ActorSchema,
  applyTokenPatch,
  placeToken,
  srdFor,
  tokenFromActor,
  tokenFromMonster,
  TokenSchema,
  uniqueId,
  uniqueName,
} from './index.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 0, y: 0, ...data });

describe('ids and names for new tokens', () => {
  it('turns a name into a free id', () => {
    const taken = new Set(['goblin', 'goblin-2']);
    expect(uniqueId('Goblin', (id) => taken.has(id))).toBe('goblin-3');
    expect(uniqueId("Brother Orrin's Wolf!", () => false)).toBe('brother-orrin-s-wolf');
    expect(uniqueId('???', () => false)).toBe('token');
  });

  it('numbers a name that is already on the map', () => {
    expect(uniqueName('Goblin', ['Wolf'])).toBe('Goblin');
    expect(uniqueName('Goblin', ['Goblin', 'Goblin 2'])).toBe('Goblin 3');
  });
});

describe('placing tokens', () => {
  it('puts odd sizes on a square centre and even sizes on a grid corner', () => {
    expect(placeToken([130, 270], 1, 100)).toEqual([150, 250]);
    expect(placeToken([130, 270], 2, 100)).toEqual([100, 300]);
    expect(placeToken([130, 270], 3, 100)).toEqual([150, 250]);
  });
});

describe('spawning', () => {
  it('makes a token from a monster stat block', () => {
    const goblin = srdFor('2014').monsters.get('goblin')!;
    const t = tokenFromMonster(goblin, { id: 'goblin-1', name: 'Goblin', at: [150, 150], rules: '2014' }, '2014');
    expect(t).toMatchObject({ id: 'goblin-1', name: 'Goblin', monster: 'goblin', x: 150, y: 150, hidden: false });
    expect(t.stats).toBeUndefined();
  });

  it("marks a monster from the other edition's book", () => {
    const boss = srdFor('2024').monsters.get('goblin-boss')!;
    const t = tokenFromMonster(boss, { id: 'b', name: 'Boss', at: [0, 0], rules: '2024', hidden: true }, '2014');
    expect(t).toMatchObject({ monster: 'goblin-boss', stats: { rules: '2024' }, hidden: true });
  });

  it('copies an actor onto the map, without its folder', () => {
    const actor = ActorSchema.parse({ id: 'bandit', name: 'Bandit', folder: 'Road', monster: 'bandit', hp: 3 });
    const t = tokenFromActor(actor, { id: 'bandit-2', name: 'Bandit 2', at: [50, 50] });
    expect(t).toMatchObject({ id: 'bandit-2', name: 'Bandit 2', monster: 'bandit', hp: 3, x: 50, y: 50 });
    expect('folder' in t).toBe(false);
  });

  it('saves a token as a fresh actor: no position, damage or spell state', () => {
    const t = token({ hp: 2, monster: 'goblin', effects: [{ id: 'bless', name: 'Bless' }], spent: { slots: [1] } });
    const actor = actorFromToken(t, 'goblin-scout', 'Scouts');
    expect(actor).toMatchObject({ id: 'goblin-scout', monster: 'goblin', folder: 'Scouts' });
    for (const key of ['x', 'y', 'hp', 'effects', 'spent']) expect(key in actor).toBe(false);
  });
});

describe('editing a token', () => {
  it('merges the patch, drops fields set to null and keeps the id', () => {
    const t = token({ hp: 2, monster: 'goblin' });
    expect(applyTokenPatch(t, { id: 'other', name: 'Snik', hp: null, speed: 25 })).toMatchObject({
      id: 't',
      name: 'Snik',
      speed: 25,
      monster: 'goblin',
    });
    expect('hp' in (applyTokenPatch(t, { hp: null }) as object)).toBe(false);
  });
});
