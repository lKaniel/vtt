import { DamageTypeSchema, omitKey, type Ability, type DamageType, type Stats } from '@vtt/shared';

// The GM's token editor works on a draft copy of the token; these helpers
// keep the draft tidy and turn it into the patch the server applies.

type Draft = Record<string, unknown> & { stats?: Stats };

/** Fields the server adds to what it sends; never edited. */
const DERIVED = new Set(['sheet', 'health']);

/** The fields of `after` that differ from `before`; cleared ones are null. */
export function tokenPatch(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (DERIVED.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    patch[key] = after[key] === undefined ? null : after[key];
  }
  return patch;
}

/** `obj` with `key` set, or removed when the value is empty. */
function withField<T extends object>(obj: T, key: string, value: unknown): T {
  const empty = value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  return empty ? omitKey(obj, key) : { ...obj, [key]: value };
}

/** The draft with one `stats` field set or cleared; an empty `stats` goes away. */
export function setStat<D extends Draft>(draft: D, key: keyof Stats, value: unknown): D {
  const stats = withField(draft.stats ?? {}, key, value);
  return withField(draft, 'stats', Object.keys(stats).length ? stats : undefined);
}

export function setAbility<D extends Draft>(draft: D, ability: Ability, score: number | undefined): D {
  const abilities = withField(draft.stats?.abilities ?? {}, ability, score);
  return setStat(draft, 'abilities', Object.keys(abilities).length ? abilities : undefined);
}

/** "fire, cold" → ['fire', 'cold'], dropping anything that isn't a damage type. */
export function parseList(text: string): DamageType[] {
  return text
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is DamageType => DamageTypeSchema.safeParse(s).success);
}

export const listText = (list: readonly string[] | undefined) => (list ?? []).join(', ');

/** A number typed into a field, or undefined for an empty one. */
export function numberOrUndefined(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}
