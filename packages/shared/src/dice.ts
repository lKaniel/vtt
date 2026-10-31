export interface DiceTerm {
  /** The term as written, e.g. "2d20kh1" or "+3". */
  text: string;
  sign: 1 | -1;
  rolls: number[];
  /** Which rolls count toward the total. */
  kept: boolean[];
  value: number;
}

export interface Roll {
  formula: string;
  terms: DiceTerm[];
  total: number;
}

export type Rng = () => number;

const TERM = /^([+-]?) *(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))$/;
const MAX_DICE = 100;
const MAX_FACES = 1000;

/** Rolls a formula like "1d20+5", "2d20kh1 + 3" or "4d6kh3". Throws on bad input. */
export function roll(formula: string, rng: Rng = Math.random): Roll {
  const src = formula.trim().toLowerCase();
  if (!src) throw new Error('Empty formula');
  // Split before every sign, so "1d20 + 5 - 1" becomes "1d20 ", "+ 5 ", "- 1".
  const terms = src.split(/(?=[+-])/).map((part) => parseTerm(part.trim(), rng));
  const total = terms.reduce((sum, t) => sum + t.sign * t.value, 0);
  return { formula: src, terms, total };
}

function parseTerm(text: string, rng: Rng): DiceTerm {
  const m = TERM.exec(text);
  if (!m) throw new Error(`Can't read "${text}"`);
  const sign = m[1] === '-' ? -1 : 1;
  if (m[6] !== undefined) return { text, sign, rolls: [], kept: [], value: Number(m[6]) };
  const count = m[2] ? Number(m[2]) : 1;
  const faces = Number(m[3]);
  if (count < 1 || count > MAX_DICE) throw new Error(`Roll between 1 and ${MAX_DICE} dice`);
  if (faces < 2 || faces > MAX_FACES) throw new Error(`Dice need 2 to ${MAX_FACES} faces`);
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * faces));
  const kept = m[4] ? keepDice(rolls, m[4] === 'kh', Number(m[5])) : rolls.map(() => true);
  const value = rolls.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
  return { text, sign, rolls, kept, value };
}

/** Marks the `keep` highest (or lowest) rolls as kept. */
function keepDice(rolls: number[], highest: boolean, keep: number): boolean[] {
  if (keep < 1 || keep > rolls.length) throw new Error(`Can't keep ${keep} of ${rolls.length} dice`);
  const order = rolls.map((v, i) => ({ v, i })).sort((a, b) => (highest ? b.v - a.v : a.v - b.v));
  const keepIdx = new Set(order.slice(0, keep).map(({ i }) => i));
  return rolls.map((_, i) => keepIdx.has(i));
}
