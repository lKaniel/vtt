import type { ImportLoss } from '@vtt/core';
import type { LeftOut } from '@vtt/shared';

// What a Foundry import could not bring along. Converters say it as
// ImportLoss values (a kind, a count, a few names); the log groups them over
// the whole world, so a report says "815 tokens whose actor is gone, in 90
// scenes" once instead of 815 times.

const EXAMPLES = 8;
const PLACES = 10;

/** `count` things of a kind that stayed behind, with some of their names. */
export function lost(what: string, count = 1, examples: readonly string[] = []): ImportLoss {
  return { what, count, ...(examples.length ? { examples: [...examples] } : {}) };
}

/** Something left out, and where (a scene's, actor's or entry's name; none: the world as a whole). */
export type PlacedLoss = ImportLoss & { place?: string };

/** `losses`, all in `place`. */
export const placed = (place: string, losses: readonly ImportLoss[]): PlacedLoss[] =>
  losses.map((l) => ({ ...l, place }));

const keep = (list: string[], x: string, max: number) => {
  if (list.length < max && !list.includes(x)) list.push(x);
};

export class LossLog {
  private readonly groups = new Map<string, { out: LeftOut; places: Set<string> }>();

  add(losses: readonly PlacedLoss[]): void {
    for (const l of losses) this.addOne(l);
  }

  private addOne(l: PlacedLoss): void {
    const group = this.groups.get(l.what) ?? {
      out: { what: l.what, count: 0, examples: [], places: [], placeCount: 0 },
      places: new Set<string>(),
    };
    this.groups.set(l.what, group);
    group.out.count += l.count;
    for (const e of l.examples ?? []) keep(group.out.examples, e, EXAMPLES);
    if (l.place === undefined || group.places.has(l.place)) return;
    group.places.add(l.place);
    group.out.placeCount = group.places.size;
    keep(group.out.places, l.place, PLACES);
  }

  /** Every kind, the most first. */
  list(): LeftOut[] {
    return [...this.groups.values()]
      .map((g) => g.out)
      .sort((a, b) => b.count - a.count || a.what.localeCompare(b.what));
  }
}

const more = (shown: number, all: number) => (all > shown ? ', ...' : '');

/** Where a kind of loss was: "Crypt", or "12: Crypt, Inn, ...". */
function placesOf(l: LeftOut): string {
  if (l.placeCount === 1) return l.places[0] ?? '';
  return `${l.placeCount}: ${l.places.join(', ')}${more(l.places.length, l.placeCount)}`;
}

/** One line for a terminal: "34 Walls that stop nothing (in 12: Crypt, Inn, ...): tree, torch, ...". */
export function leftOutLine(l: LeftOut): string {
  const where = l.placeCount ? ` (in ${placesOf(l)})` : '';
  const examples = l.examples.length ? `: ${l.examples.join(', ')}${more(l.examples.length, l.count)}` : '';
  return `${l.count} ${l.what}${where}${examples}`;
}

/** An ImportLoss as one line of its own, for the asset-pack import's list. */
export function lossLine(l: PlacedLoss): string {
  const examples = l.examples?.length ? ` (${l.examples.join(', ')})` : '';
  const place = l.place ? l.place + ': ' : '';
  return `${place}${l.count} ${l.what}${examples}`;
}
