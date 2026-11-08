// Formulas a homebrew class writes its costs in: numbers, names, + - * /
// and brackets, e.g. "base * senses * weight". A name the caller doesn't
// give counts as 0. Parsed by hand so nothing in a class file ever runs as code.

const TOKEN = /\s*(\d+(?:\.\d+)?|[a-z][a-z0-9]*|[-+*/()])/y;

function tokens(src: string): string[] {
  const out: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    if (/^\s*$/.test(src.slice(TOKEN.lastIndex))) break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`Can't read "${src.slice(at).trim()}"`);
    out.push(m[1]!);
  }
  return out;
}

class Parser {
  private at = 0;
  constructor(
    private list: string[],
    private vars: Readonly<Record<string, number>>,
  ) {}

  run(): number {
    const value = this.sum();
    if (this.at < this.list.length) throw new Error(`Unexpected "${this.list[this.at]}"`);
    return value;
  }

  private sum(): number {
    let value = this.product();
    while (this.peek('+') || this.peek('-'))
      value = this.next() === '+' ? value + this.product() : value - this.product();
    return value;
  }

  private product(): number {
    let value = this.unary();
    while (this.peek('*') || this.peek('/')) value = this.next() === '*' ? value * this.unary() : value / this.unary();
    return value;
  }

  private unary(): number {
    if (!this.peek('-') && !this.peek('+')) return this.atom();
    const sign = this.next() === '-' ? -1 : 1;
    return sign * this.unary();
  }

  private atom(): number {
    const t = this.next();
    if (t === undefined) throw new Error('The formula ends too soon');
    if (t === '(') {
      const value = this.sum();
      if (this.next() !== ')') throw new Error('Missing )');
      return value;
    }
    if (/^\d/.test(t)) return Number(t);
    if (/^[a-z]/.test(t)) return this.vars[t] ?? 0;
    throw new Error(`Unexpected "${t}"`);
  }

  private peek(t: string): boolean {
    return this.list[this.at] === t;
  }

  private next(): string | undefined {
    return this.list[this.at++];
  }
}

/** The formula's value with these names; throws on a formula it can't read. */
export function evaluate(formula: string, vars: Readonly<Record<string, number>>): number {
  return new Parser(tokens(formula.toLowerCase()), vars).run();
}

/** What's wrong with a formula, or undefined when it reads. */
export function formulaIssue(formula: string): string | undefined {
  try {
    evaluate(formula, {});
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}
