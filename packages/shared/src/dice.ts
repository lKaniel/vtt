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

const TERM = /([+-]?)\s*(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gy;

/** Rolls a formula like "1d20+5", "2d20kh1 + 3" or "4d6kh3". Throws on bad input. */
export function roll(formula: string, rng: Rng = Math.random): Roll {
  const src = formula.trim().toLowerCase();
  if (!src) throw new Error('Empty formula');
  const terms: DiceTerm[] = [];
  TERM.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    while (src[pos] === ' ') pos++;
    if (pos >= src.length) break;
    TERM.lastIndex = pos;
    const m = TERM.exec(src);
    if (!m || m[0].trim() === '') throw new Error(`Can't read "${src.slice(pos)}"`);
    if (terms.length > 0 && !m[1]) throw new Error(`Missing + or - before "${m[0].trim()}"`);
    pos = TERM.lastIndex;
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      const n = Number(m[6]);
      terms.push({ text: m[0].trim(), sign, rolls: [], kept: [], value: n });
      continue;
    }
    const count = m[2] ? Number(m[2]) : 1;
    const faces = Number(m[3]);
    if (count < 1 || count > 100) throw new Error('Roll between 1 and 100 dice');
    if (faces < 2 || faces > 1000) throw new Error('Dice need 2 to 1000 faces');
    const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * faces));
    let kept = rolls.map(() => true);
    if (m[4]) {
      const keep = Number(m[5]);
      if (keep < 1 || keep > count) throw new Error(`Can't keep ${keep} of ${count} dice`);
      const order = rolls.map((v, i) => [v, i] as const).sort((a, b) => (m[4] === 'kh' ? b[0] - a[0] : a[0] - b[0]));
      const keepIdx = new Set(order.slice(0, keep).map(([, i]) => i));
      kept = rolls.map((_, i) => keepIdx.has(i));
    }
    const value = rolls.reduce((sum, v, i) => sum + (kept[i] ? v : 0), 0);
    terms.push({ text: m[0].trim(), sign, rolls, kept, value });
  }
  const total = terms.reduce((sum, t) => sum + t.sign * t.value, 0);
  return { formula: src, terms, total };
}
