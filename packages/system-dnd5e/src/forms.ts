import type { Content } from './content.ts';
import { characterLevel } from './multiclass.ts';
import type { Effect, Spell } from './spell-schema.ts';
import type { Monster } from './monster-schema.ts';
import type { Token } from './token-schema.ts';

// Shape-shifting (polymorph, true polymorph, shapechange, animal shapes): the
// creature takes another stat block while an effect with a `form` lasts.
// 2014 forms bring their own hit points, its own are put aside in `trueForm`
// and given back when it changes back; 2024 forms give temporary hit points
// and the spell ends when they are gone.

export type Form = NonNullable<Effect['form']>;

/** The shape a creature is in, if any. */
export function formOf(token: Pick<Token, 'effects'>): Form | undefined {
  return token.effects?.find((e) => e.form)?.form;
}

/** The token without its shape: the effect stays, only its `form` goes. */
export function withoutForm(token: Token): Token {
  const effects = token.effects?.map((e) => (e.form ? { ...e, form: undefined } : e));
  return { ...token, effects };
}

/** The token as its shape's stat block, keeping its hit points, effects and (with `keepMind`) its mind. */
export function shapeToken(token: Token, form: Form, own: { int: number; wis: number; cha: number }): Token {
  const base = withoutForm(token);
  return {
    ...base,
    monster: form.monster,
    stats: form.keepMind ? { abilities: own } : undefined,
    inventory: [],
  };
}

type Transform = NonNullable<Spell['transform']>;

function fits(t: Transform, m: Monster): boolean {
  const type = m.type ?? '';
  if (t.types && !t.types.includes(type)) return false;
  if (t.notTypes?.includes(type)) return false;
  return t.maxSize === undefined || m.size <= t.maxSize;
}

/** The highest challenge rating a form may have against `target`, cast at `casterLevel`. */
function crCap(t: Transform, target: Token | undefined, casterLevel: number, content: Content): number {
  if (typeof t.maxCr === 'number') return t.maxCr;
  if (t.maxCr === 'caster' || !target) return casterLevel;
  const monster = target.monster ? content.monsters.get(target.monster) : undefined;
  return monster?.cr ?? characterLevel(target.stats) ?? 0;
}

/** The forms a spell can turn creatures into, lowest challenge first; a cap set by the target isn't applied. */
export function formChoices(spell: Spell, content: Content, casterLevel: number): Monster[] {
  const t = spell.transform;
  if (!t) return [];
  const cap = t.maxCr === 'target' ? Number.POSITIVE_INFINITY : crCap(t, undefined, casterLevel, content);
  return [...content.monsters.values()]
    .filter((m) => fits(t, m) && m.cr <= cap)
    .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
}

/** Why `monster` can't be the form `spell` gives `target`, or undefined if it can. */
export function formProblem(
  spell: Spell,
  monster: Monster | undefined,
  { target, casterLevel, content }: { target: Token; casterLevel: number; content: Content },
): string | undefined {
  const t = spell.transform;
  if (!t) return undefined;
  if (!monster) return `pick a form for ${spell.name}`;
  if (!fits(t, monster))
    return `can't turn into ${monster.name} (${spell.name} allows ${(t.types ?? ['any creature']).join(', ')} only)`;
  const cap = crCap(t, target, casterLevel, content);
  if (monster.cr > cap) return `can't turn ${target.name} into ${monster.name}: its challenge rating is above ${cap}`;
  return undefined;
}

/**
 * The token as its shape leaves it, after any change: changing shape puts its
 * own hit points aside (2014) or gives the form's as temporary ones (2024);
 * the 2024 spell ends when those are gone; changing back gives its own hit
 * points back. `formHp` is a form's hit point maximum. Undefined when nothing
 * changes.
 */
export function withForm(token: Token, formHp: (monster: string) => number): Token | undefined {
  const form = formOf(token);
  const was = token.trueForm;
  if (form && !was) return changeShape(token, form, formHp(form.monster));
  if (form && was?.mode === 'temp' && (token.tempHp ?? 0) <= 0) return changeBack(endShape(token));
  if (!form && was) return changeBack(token);
  return undefined;
}

function changeShape(token: Token, form: Form, hp: number): Token {
  if (form.hp === 'temp') return { ...token, trueForm: { mode: 'temp' }, tempHp: hp };
  return { ...token, trueForm: { mode: 'replace', hp: token.hp }, hp: undefined, tempHp: undefined };
}

/** The token with the effects that hold it in a shape ended. */
export function endShape(token: Token): Token {
  return { ...token, effects: (token.effects ?? []).filter((e) => !e.form) };
}

/** The token back in its own shape: its own hit points, any form temporary hit points gone. */
export function changeBack(token: Token): Token {
  const was = token.trueForm;
  if (!was) return token;
  if (was.mode === 'temp') return { ...token, trueForm: undefined, tempHp: undefined };
  return { ...token, trueForm: undefined, hp: was.hp, tempHp: undefined };
}

/** The spell with the picked form put on the effect it leaves. */
export function spellWithForm(spell: Spell, monster: string): Spell {
  const t = spell.transform;
  if (!t) return spell;
  const form: Form = { monster, hp: t.hp, ...(t.keepMind && { keepMind: true }) };
  return { ...spell, effect: { ...spell.effect, form } };
}
