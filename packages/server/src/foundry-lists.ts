import { z } from 'zod';

/** A list in a Foundry document: what parses of it, leaving out what doesn't; missing = empty. */
export const foundryList = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((xs) => (xs ?? []).flatMap((x) => (item.safeParse(x).success ? [item.parse(x)] : [])));
