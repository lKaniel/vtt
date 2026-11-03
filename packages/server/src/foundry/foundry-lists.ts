import { z } from 'zod';

/** The Foundry data each parsed item came from, for what its schema leaves out (its floors). */
const SOURCES = new WeakMap<object, unknown>();

/** The Foundry data an item parsed by `foundryList` came from (else the item itself). */
export const sourceOf = (item: object): unknown => SOURCES.get(item) ?? item;

/** Parses `x`, remembering where the result came from. */
function parsed<T extends z.ZodType>(item: T, x: unknown): z.infer<T>[] {
  const r = item.safeParse(x);
  if (!r.success) return [];
  if (r.data && typeof r.data === 'object') SOURCES.set(r.data, x);
  return [r.data];
}

/** A list in a Foundry document: what parses of it, leaving out what doesn't; missing = empty. */
export const foundryList = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((xs) => (xs ?? []).flatMap((x) => parsed(item, x)));
