import { levelValue, type FeatureSheet } from './classes.ts';
import type { Creature } from './creature.ts';
import type { Token } from './token-schema.ts';

// A jaeger's momentum: dice that spending focus points builds (one a point),
// up to proficiency + the better of Str and Dex. They last until the end of
// the jaeger's next turn, and again each time it gains a die, attacks, or
// ends its turn next to a foe; finishers spend them all. The pool is the
// `momentum` feature's uses on the sheet: `left` is the dice held.

/** The dice a creature holds, how many it may hold and their size; undefined without momentum. */
export function momentumDice(
  sheet: Pick<Creature, 'features'>,
): { dice: number; max: number; die: number } | undefined {
  const f = sheet.features.find((s) => s.momentum);
  if (!f) return undefined;
  return { dice: f.left ?? 0, max: f.max ?? 0, die: levelValue(f.die ?? [], f.classLevel ?? 1) };
}

/** `n` more dice on top of the token's (to the most the sheet allows); gaining dice keeps them all fresh. */
export function gainMomentum(token: Token, sheet: Pick<Creature, 'features'>, n: number): Token {
  const pool = momentumDice(sheet);
  if (!pool || n <= 0) return token;
  const dice = Math.min(pool.max, (token.momentum?.dice ?? 0) + n);
  return dice > 0 ? { ...token, momentum: { dice, fresh: true } } : token;
}

/** Every die spent (a finisher). */
export function spendMomentum(token: Token): Token {
  return token.momentum ? { ...token, momentum: undefined } : token;
}

/** The creature attacked: its dice last another turn. */
export function freshMomentum(token: Token): Token {
  return token.momentum && !token.momentum.fresh ? { ...token, momentum: { ...token.momentum, fresh: true } } : token;
}

/** At the end of its turn: dice not kept fresh since the last turn fade, unless it stands by a foe. */
export function keepMomentum(token: Token, nearFoe: boolean): Token {
  const held = token.momentum;
  if (!held) return token;
  if (!held.fresh && !nearFoe) return { ...token, momentum: undefined };
  return held.fresh ? { ...token, momentum: { dice: held.dice } } : token;
}

/** Dice spending `amount` uses of `feature` gives: one a point of the pool momentum is built from. */
export function momentumForSpend(
  sheet: Pick<Creature, 'features' | 'effects'>,
  feature: FeatureSheet,
  amount: number,
): number {
  const from = feature.usesFrom ?? feature.id;
  const pool = sheet.features.find((s) => s.momentum);
  if (pool?.momentum?.from !== from) return 0;
  const per = Math.max(1, ...sheet.effects.map((e) => e.momentumPerPoint ?? 1));
  return amount * per;
}

/** One spent use of `id` back. */
function regainUse(token: Token, id: string): Token {
  const spent = token.spent?.uses?.[id] ?? 0;
  if (spent <= 0) return token;
  return { ...token, spent: { ...token.spent, uses: { ...token.spent?.uses, [id]: spent - 1 } } };
}

const regaining = (sheet: Pick<Creature, 'features'>, when: 'nat20' | 'initiative') =>
  sheet.features.filter((f) => f.regain?.[when] && f.max !== undefined);

/** A natural 20 against a foe: a point back of each pool that comes back that way. */
export function regainOnNat20(token: Token, sheet: Pick<Creature, 'features'>): Token {
  return regaining(sheet, 'nat20').reduce((t, f) => regainUse(t, f.id), token);
}

/** Initiative rolled: a point back of each such pool that is empty. */
export function regainOnInitiative(token: Token, sheet: Pick<Creature, 'features'>): Token {
  return regaining(sheet, 'initiative')
    .filter((f) => f.left === 0)
    .reduce((t, f) => regainUse(t, f.id), token);
}

/** A point back of the pool momentum is built from (a finisher that drops its target). */
export function regainFocus(token: Token, sheet: Pick<Creature, 'features'>, n = 1): Token {
  const from = sheet.features.find((s) => s.momentum)?.momentum?.from;
  let out = token;
  for (let i = 0; from && i < n; i++) out = regainUse(out, from);
  return out;
}
