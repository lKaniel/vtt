import { freeId, slugify } from '@vtt/core';
import { type Class, ClassSchema, type LevelTable } from '@vtt/system-dnd5e';

// The GM's homebrew class editor: level tables written as text, a class to
// start from, and the options a character of the class still has to pick.

/** "1: 4, 5: 10": at level 1 it is 4, from level 5 it is 10. */
export function levelTableText(table: LevelTable | undefined): string {
  return (table ?? []).map(([level, value]) => `${level}: ${value}`).join(', ');
}

/** Reads "1: 4, 5: 10" back, sorted by level; pieces that aren't "level: number" (1-20) are dropped. */
export function parseLevelTable(text: string): LevelTable {
  const rows = text.split(',').flatMap((part): [number, number][] => {
    const [level, value] = part.split(':').map((s) => Number(s.trim()));
    const ok = Number.isInteger(level) && level! >= 1 && level! <= 20 && Number.isInteger(value);
    return ok && part.includes(':') ? [[level!, value!]] : [];
  });
  return rows.sort((a, b) => a[0] - b[0]);
}

/** A new homebrew class document's fields. */
export function blankClass(id: string, name: string): Class & { id: string; kind: 'class' } {
  return { id, kind: 'class', name, hitDie: 8, saves: [], features: [] };
}

export const withAt = <T>(list: readonly T[], i: number, value: T): T[] => list.map((x, j) => (j === i ? value : x));
export const withoutAt = <T>(list: readonly T[], i: number): T[] => list.filter((_, j) => j !== i);

/** A homebrew document as a class to edit; what the rules can't read starts over from a blank class. */
export function classOfDoc(doc: { id: string; name?: unknown } & Record<string, unknown>): Class {
  const parsed = ClassSchema.safeParse(doc);
  if (parsed.success) return parsed.data;
  return blankClass(doc.id, typeof doc.name === 'string' ? doc.name : doc.id);
}

const OPTIONAL = ['spellcasting', 'scales', 'choices', 'subclassLevel', 'subclasses', 'multiclass'] as const;

/** The edited class as one patch of its document: fields it no longer has are removed. */
export function classPatch(draft: Class): Record<string, unknown> {
  const { id: _id, ...fields } = draft;
  const removed = Object.fromEntries(OPTIONAL.filter((k) => fields[k] === undefined).map((k) => [k, null]));
  return { ...fields, ...removed };
}

/** An id for a new row named `name`, free among `list`'s. */
export function freshId(name: string, list: readonly { id: string }[]): string {
  return freeId(slugify(name) || 'item', (id) => list.some((x) => x.id === id), { bare: true });
}
