import { diceFormula, diceText } from '@vtt/shared';
import { evaluate } from './formula.ts';
import { type Damage, type DamageType, DamageTypeSchema } from './stats-schema.ts';

// A weapon written as formulas (the item editor's "Damage formula" and
// "Attack formula"), as flexible as a GM's homebrew: "1d10 psychic + 1d12
// piercing + 2*dex + 5 + prof". Each typed dice term is its own damage part;
// dice without a type are the weapon's own damage type, and the numbers are
// added to the first part. Names read the wielder: ability modifiers, the
// attack's ability modifier (`mod`), proficiency (0 when untrained) and
// character level. Parsed by hand: nothing typed ever runs as code.

/** What a weapon formula's names stand for. */
export interface FormulaVars {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  /** The modifier of the ability the attack uses (Strength, Dexterity for finesse or ranged). */
  mod: number;
  /** Proficiency bonus, 0 when not trained with the weapon. */
  prof: number;
  level: number;
}

/** Every name a formula may use, and which value it reads. */
const NAMES: Readonly<Record<string, keyof FormulaVars>> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha',
  mod: 'mod',
  prof: 'prof',
  proficiency: 'prof',
  pb: 'prof',
  level: 'level',
  lvl: 'level',
};

/** Damage part by part, from a damage formula; `type` for dice without one. Throws an Error it can't read. */
export function formulaDamage(src: string, type: DamageType, vars: FormulaVars): Damage[] {
  const parts: Damage[] = [];
  let plain: Damage | undefined;
  let bonus = 0;
  for (const term of terms(src)) {
    const read = readTerm(term, vars);
    if (read.kind === 'number') bonus += read.value;
    else if (read.type) parts.push({ dice: read.dice, type: read.type });
    else if (plain) plain.dice = `${plain.dice}+${read.dice}`;
    else {
      plain = { dice: read.dice, type };
      parts.push(plain);
    }
  }
  const total = Math.floor(bonus);
  if (!parts.length) return [{ dice: String(Math.max(0, total)), type }];
  const [first, ...rest] = parts;
  return [{ ...first!, dice: withBonus(first!.dice, total) }, ...rest];
}

/** The attack bonus from an attack formula ("dex + prof + 1"). Throws an Error it can't read. */
export function formulaHit(src: string, vars: FormulaVars): number {
  return Math.floor(
    terms(src).reduce((sum, term) => {
      const read = readTerm(term, vars);
      if (read.kind !== 'number') throw new Error('An attack bonus has no dice; write it like dex + prof + 1');
      return sum + read.value;
    }, 0),
  );
}

const ZERO: FormulaVars = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0, mod: 0, prof: 0, level: 1 };

/** Why a damage or attack formula can't be read, or undefined when it can. */
export function weaponFormulaProblem(src: string, kind: 'damage' | 'hit'): string | undefined {
  try {
    if (kind === 'hit') formulaHit(src, ZERO);
    else formulaDamage(src, 'slashing', ZERO);
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

interface Term {
  sign: 1 | -1;
  text: string;
}

const DEPTH: Readonly<Record<string, number>> = { '(': 1, ')': -1 };

/** Where the formula's + and - outside brackets are. */
function signsAt(src: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    depth += DEPTH[c] ?? 0;
    if (depth === 0 && (c === '+' || c === '-')) out.push(i);
  }
  return out;
}

/** The formula split at its + and - outside brackets (a sign may lead). */
function terms(src: string): Term[] {
  const out: Term[] = [];
  let from = 0;
  let sign: 1 | -1 = 1;
  for (const at of [...signsAt(src), src.length]) {
    const text = src.slice(from, at).trim();
    const leading = from === 0 && at < src.length;
    if (text) out.push({ sign, text });
    else if (!leading) throw new Error(`Something is missing in "${src.trim()}"`);
    sign = src[at] === '-' ? -1 : 1;
    from = at + 1;
  }
  return out;
}

/** A term's last word, when it is one ("2d6 fire": fire), and what comes before it. */
function lastWord(text: string): { body: string; word: string } | undefined {
  const at = Math.max(text.lastIndexOf(' '), text.lastIndexOf('\t'));
  const word = text.slice(at + 1);
  return at > 0 && /^[a-z]+$/i.test(word) ? { body: text.slice(0, at).trim(), word: word.toLowerCase() } : undefined;
}

type Read = { kind: 'number'; value: number } | { kind: 'dice'; dice: string; type?: DamageType };

/** One term: dice ("2d6 fire"), or numbers and names ("2*dex"), maybe with a damage type ("3 radiant"). */
function readTerm({ sign, text }: Term, vars: FormulaVars): Read {
  const typed = lastWord(text);
  const type = typed && !(typed.word in NAMES) ? damageType(typed.word) : undefined;
  const body = type ? typed!.body : text;
  const dice = /^\d*[dв]\d/iu.test(body.replace(/\s/g, '')) ? diceFormula(body) : undefined;
  if (dice) {
    if (sign < 0) throw new Error(`Dice can't be taken away: "-${text}"`);
    return { kind: 'dice', dice, ...(type && { type }) };
  }
  const value = sign * number(body, vars);
  return type ? { kind: 'dice', dice: String(value), type } : { kind: 'number', value };
}

function damageType(word: string): DamageType {
  const parsed = DamageTypeSchema.safeParse(word);
  if (!parsed.success) throw new Error(`"${word}" isn't a damage type or a name the formula knows`);
  return parsed.data;
}

/** A term of numbers and names, with only names the formula knows. */
function number(text: string, vars: FormulaVars): number {
  const src = diceText(text);
  for (const name of src.match(/[a-z]+/g) ?? []) {
    if (!(name in NAMES))
      throw new Error(`"${name}" isn't a name the formula knows (use str, dex, mod, prof, level...)`);
  }
  const values = Object.fromEntries(Object.entries(NAMES).map(([name, key]) => [name, vars[key]]));
  return evaluate(src, values);
}

function withBonus(dice: string, n: number): string {
  if (n === 0) return dice;
  return n > 0 ? `${dice}+${n}` : `${dice}${n}`;
}

/**
 * Damage that names its type after each part, read on its own (what rides
 * on a hit): "2d6 poison + 1d4+1 acid". Throws an Error it can't read.
 */
export function typedDamage(src: string): Damage[] {
  const out: Damage[] = [];
  let pending = '';
  for (const { sign, text } of terms(src)) {
    const typed = lastWord(text);
    const piece = joined(pending, sign, typed ? typed.body : text);
    if (typed) {
      const dice = diceFormula(piece);
      if (!dice) throw new Error(`"${piece}" can't be rolled; write it like 2d6 poison`);
      out.push({ dice, type: damageType(typed.word) });
    }
    pending = typed ? '' : piece;
  }
  if (pending) throw new Error(`Name a damage type after "${pending}", like 2d6 poison`);
  return out;
}

/** `text` after what came before it, with its sign. */
function joined(before: string, sign: 1 | -1, text: string): string {
  if (sign < 0) return `${before}-${text}`;
  return before ? `${before}+${text}` : text;
}

/** Damage as typed: "2d6 poison + 1d4 acid". */
export const damageText = (damage: readonly Damage[]): string => damage.map((d) => `${d.dice} ${d.type}`).join(' + ');
