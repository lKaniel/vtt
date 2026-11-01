// Fractional indexing: string keys that sort between their neighbours, so an
// item can be dropped between two others without renumbering the rest. Keys
// are base-62 digit strings read as fractions in (0, 1); "V" is about 0.5.

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function digit(char: string | undefined, fallback: number): number {
  return char === undefined ? fallback : DIGITS.indexOf(char);
}

/** A key strictly between `a` ('' = 0) and `b` (null = 1). Neither may end in "0". */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const lo = digit(a[0], 0);
  const hi = b === null ? DIGITS.length : digit(b[0], 0);
  if (hi - lo > 1) return DIGITS[Math.round((lo + hi) / 2)]!;
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[lo]! + midpoint(a.slice(1), null);
}

/** A key after `a`, one digit step on, so appending keeps keys short. */
function after(a: string): string {
  const d = digit(a[0], -1);
  if (d < 0) return 'V';
  if (d < DIGITS.length - 1) return DIGITS[d + 1]!;
  return a[0]! + after(a.slice(1));
}

/** A key before `b`, one digit step back when that's possible. */
function before(b: string): string {
  const d = digit(b[0], 0);
  return d > 1 ? DIGITS[d - 1]! : midpoint('', b);
}

/** A sort key after `a` and before `b`; null means the start or end of the list. */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) throw new Error(`sort keys out of order: ${a} >= ${b}`);
  if (a === null && b === null) return 'V';
  if (b === null) return after(a!);
  if (a === null) return before(b);
  return midpoint(a, b);
}

/** `n` ordered sort keys after `a` and before `b`. */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  const mid = keyBetween(a, b);
  const half = Math.floor(n / 2);
  return [...keysBetween(a, mid, half), mid, ...keysBetween(mid, b, n - half - 1)];
}
