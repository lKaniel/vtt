import { NO_SENSES, tokensVisibleTo } from '@vtt/shared';
import { type Effect, type MonsterSenses, perceiverOf, sensesOf, type Token, TokenSchema } from './index.ts';
import { describe, expect, it } from 'vitest';

const G = 100;
const token = (extra: object = {}) => TokenSchema.parse({ id: 't', name: 'T', x: 0, y: 0, ...extra });
const effect = (extra: Partial<Effect>): Effect => ({ id: 'e', name: 'E', ...extra });

describe('sensesOf', () => {
  it('takes the best of the token, its monster and its effects', () => {
    const senses = sensesOf(
      token({ darkvision: 30, effects: [effect({ senses: { darkvision: 60, seeInvisible: true } })] }),
      { darkvision: 0, blindsight: 10, tremorsense: 0, truesight: 0 },
    );
    expect(senses).toEqual({
      darkvision: 60,
      blindsight: 10,
      tremorsense: 0,
      truesight: 0,
      devilsSight: 0,
      seeInvisible: true,
    });
  });

  it('reads blindsight, truesight and devil’s sight written on the token', () => {
    const s = sensesOf(token({ blindsight: 30, truesight: 120, devilsSight: 120 }));
    expect([s.blindsight, s.truesight, s.devilsSight]).toEqual([30, 120, 120]);
  });
});

describe('perceiverOf', () => {
  it('turns the blinded and invisible conditions into what the engine checks', () => {
    const p = perceiverOf(token({ effects: [effect({ conditions: ['blinded', 'invisible'] })] }));
    expect(p).toEqual({ senses: NO_SENSES, blinded: true, invisible: true });
  });
});

describe('who sees whom with D&D senses', () => {
  const player = { id: 'p1', name: 'P1', role: 'player' as const, color: '#fff' };
  const ctx = (darkness: number) => ({
    world: { darkness, vision: true, gridSize: G },
    lights: [],
    wallsBetween: () => [],
    perceiver: (t: Token) => perceiverOf(t),
  });

  it('hides invisible creatures from plain sight', () => {
    const hero = TokenSchema.parse({
      id: 'hero',
      name: 'Hero',
      x: 50,
      y: 50,
      ownership: { default: 'limited', p1: 'owner' },
    });
    const sprite = TokenSchema.parse({
      id: 'sprite',
      name: 'Sprite',
      x: 250,
      y: 50,
      effects: [effect({ conditions: ['invisible'] })],
    });
    expect(tokensVisibleTo(player, [hero, sprite], ctx(0)).has('sprite')).toBe(false);
    const bat = { ...hero, blindsight: 60 };
    expect(tokensVisibleTo(player, [bat, sprite], ctx(0)).has('sprite')).toBe(true);
  });

  it('uses the monster’s senses through a lookup', () => {
    const hero = TokenSchema.parse({
      id: 'hero',
      name: 'Hero',
      x: 50,
      y: 50,
      ownership: { default: 'limited', p1: 'owner' },
      monster: 'bat',
    });
    const orc = TokenSchema.parse({ id: 'orc', name: 'Orc', x: 1450, y: 50 });
    const senses: MonsterSenses = { darkvision: 0, blindsight: 60, tremorsense: 0, truesight: 0 };
    const monster = (t: Token) => (t.monster === 'bat' ? senses : undefined);
    expect(
      tokensVisibleTo(player, [hero, orc], { ...ctx(1), perceiver: (t: Token) => perceiverOf(t, monster(t)) }).has(
        'orc',
      ),
    ).toBe(false);
    const near = { ...orc, x: 450 };
    expect(
      tokensVisibleTo(player, [hero, near], { ...ctx(1), perceiver: (t: Token) => perceiverOf(t, monster(t)) }).has(
        'orc',
      ),
    ).toBe(true);
  });
});
