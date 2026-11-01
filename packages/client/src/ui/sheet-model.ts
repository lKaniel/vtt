import { type Actor, type Creature, type Edition, omitKey, resolveCreature, type TokenView } from '@vtt/system-dnd5e';
import { gameContent } from '../content.ts';

/** What a sheet shows and edits: an actor, or a token (an actor with a position). */
export type Draft = Actor & Partial<Pick<TokenView, 'x' | 'y' | 'sheet' | 'health' | 'actor'>>;
/** Changes the draft; `now` saves at once instead of after typing stops. */
export type Update = (fn: (d: Draft) => Draft, now?: boolean) => void;

/** The creature as the rules build it; a plain token gets default stats so the GM can fill them in. */
export function previewSheet(draft: Draft, rules: Edition): Creature | undefined {
  const as = (d: Draft) => {
    try {
      return resolveCreature({ x: 0, y: 0, ...d, stats: d.stats ?? {} }, gameContent(rules));
    } catch {
      return undefined;
    }
  };
  return as(draft) ?? as(omitKey(draft, 'monster'));
}

/** `d` with `key` set, or removed when `v` is undefined. */
export function withKey(d: Draft, key: keyof Draft, v: unknown): Draft {
  return v === undefined ? omitKey(d, key) : { ...d, [key]: v };
}
