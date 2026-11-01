import type { Rng } from './dice.ts';
import type { RollTable, TableResult } from './journals.ts';

// Rolling on a table: one die over every result's chances (its weight),
// skipping results already drawn when the table draws without replacement.

const weightOf = (r: TableResult) => r.weight ?? 1;
const open = (t: RollTable, r: TableResult) => t.replacement !== false || !r.drawn;

/** The result drawn, the die's face and how many faces it had; undefined when nothing is left to draw. */
export function drawFrom(t: RollTable, rng: Rng): { index: number; roll: number; of: number } | undefined {
  const live = t.results.flatMap((r, index) => (open(t, r) ? [{ index, weight: weightOf(r) }] : []));
  const of = live.reduce((sum, r) => sum + r.weight, 0);
  if (!of) return undefined;
  const roll = Math.min(of, Math.floor(rng() * of) + 1);
  let left = roll;
  for (const r of live) {
    left -= r.weight;
    if (left <= 0) return { index: r.index, roll, of };
  }
  return undefined;
}

/** The patch marking result `index` drawn, for a table without replacement. */
export function drawnPatch(t: RollTable, index: number): Pick<RollTable, 'results'> | undefined {
  if (t.replacement !== false) return undefined;
  return { results: t.results.map((r, i) => (i === index ? { ...r, drawn: true } : r)) };
}

/** Every result back in the table. */
export function resetPatch(t: RollTable): Pick<RollTable, 'results'> {
  return { results: t.results.map(({ drawn: _drawn, ...r }) => r) };
}
