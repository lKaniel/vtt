// The action bar comes in two sizes: the full painted bar (three rows of ten
// tiles) and a compact strip that shows one row at a time and pages through
// the others. The choice is remembered per browser; a short screen starts
// compact.

export type BarSize = 'full' | 'compact';

export const ROW_TILES = 10;

const KEY = 'vtt.actionBar';

/** How many rows of ten the slots fill (at least one). */
export function barRows(count: number): number {
  return Math.max(1, Math.ceil(count / ROW_TILES));
}

/** A row number wrapped into 0..rows-1, so paging past either end goes round. */
export function wrapRow(row: number, rows: number): number {
  return ((row % rows) + rows) % rows;
}

/** One row of ten slots, padded with nulls; a row past either end wraps round. */
export function barRow<T>(slots: readonly T[], row: number): (T | null)[] {
  const at = wrapRow(row, barRows(slots.length));
  const cut: (T | null)[] = slots.slice(at * ROW_TILES, (at + 1) * ROW_TILES);
  while (cut.length < ROW_TILES) cut.push(null);
  return cut;
}

/** Compact on a screen under 720 px tall, where the full bar covers half the map. */
export function defaultBarSize(height: number): BarSize {
  return height < 720 ? 'compact' : 'full';
}

export function loadBarSize(): BarSize {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'full' || saved === 'compact') return saved;
  } catch {
    // Storage may be blocked; fall back to the screen's default.
  }
  return defaultBarSize(globalThis.innerHeight);
}

export function saveBarSize(size: BarSize): void {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    // Private windows may refuse storage; the choice lasts until reload.
  }
}
