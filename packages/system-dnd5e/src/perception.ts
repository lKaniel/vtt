import type { Perceiver, Senses } from '@vtt/shared';
import type { Monster } from './monster-schema.ts';
import type { Token } from './token-schema.ts';
import type { EffectTemplate } from './spell-schema.ts';

// How a D&D creature perceives: senses from the token, its stat block and the
// effects on it, plus the blinded and invisible conditions. The engine's
// vision and fog (shared senses.ts) take it from here.

export type MonsterSenses = Pick<Monster, 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight'>;

type Range = 'darkvision' | 'blindsight' | 'tremorsense' | 'truesight' | 'devilsSight';

type Seeing = Pick<EffectTemplate, 'senses' | 'darkvisionPlus'>;

/** The best of what the token, its monster, the effects on it and its always-on features (`always`) grant. */
export function sensesOf(token: Token, monster?: Partial<MonsterSenses>, always: readonly Seeing[] = []): Senses {
  const effects: Seeing[] = [...(token.effects ?? []), ...always];
  const granted = effects.flatMap((e) => (e.senses ? [e.senses] : []));
  const range = (key: Range) =>
    Math.max(token[key] ?? 0, (key === 'devilsSight' ? 0 : monster?.[key]) ?? 0, ...granted.map((g) => g[key] ?? 0));
  const plus = Math.max(0, ...effects.map((e) => e.darkvisionPlus ?? 0));
  const seeing = range('darkvision');
  return {
    darkvision: plus ? Math.max(seeing, Math.max(token.darkvision, monster?.darkvision ?? 0) + plus) : seeing,
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
export function perceiverOf(token: Token, monster?: Partial<MonsterSenses>, always: readonly Seeing[] = []): Perceiver {
  return {
    senses: sensesOf(token, monster, always),
    blinded: hasCondition(token, 'blinded'),
    invisible: hasCondition(token, 'invisible'),
  };
}
