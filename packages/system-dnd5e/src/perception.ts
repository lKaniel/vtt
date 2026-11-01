import type { Perceiver, Senses } from '@vtt/shared';
import type { Monster } from './stats-schema.ts';
import type { Token } from './token-schema.ts';

// How a D&D creature perceives: senses from the token, its stat block and the
// effects on it, plus the blinded and invisible conditions. The engine's
// vision and fog (shared senses.ts) take it from here.

export type MonsterSenses = Pick<Monster, 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight'>;

type Range = 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight' | 'devilsSight';

/** The best of what the token, its monster and the effects on it grant. */
export function sensesOf(token: Token, monster?: Partial<MonsterSenses>): Senses {
  const granted = (token.effects ?? []).flatMap((e) => (e.senses ? [e.senses] : []));
  const range = (key: Range) =>
    Math.max(token[key] ?? 0, (key === 'devilsSight' ? 0 : monster?.[key]) ?? 0, ...granted.map((g) => g[key] ?? 0));
  return {
    darkvision: range('darkvision'),
    blindsight: range('blindsight'),
    tremorsense: range('tremorsense'),
    truesight: range('truesight'),
    devilsSight: range('devilsSight'),
    seeInvisible: granted.some((g) => g.seeInvisible === true),
  };
}

export function hasCondition(token: Token, condition: string): boolean {
  return (token.effects ?? []).some((e) => e.conditions?.includes(condition as never));
}

/** What the engine needs to decide who notices `token` and what it notices. */
export function perceiverOf(token: Token, monster?: Partial<MonsterSenses>): Perceiver {
  return {
    senses: sensesOf(token, monster),
    blinded: hasCondition(token, 'blinded'),
    invisible: hasCondition(token, 'invisible'),
  };
}
