import type { Light } from './schema.ts';

// Lights that burn for a while, by world time (clock.ts): a torch lasts an
// hour, a campfire a night. A light with `lasts` is given the clock second it
// goes out (`endsAt`) once it is lit, and is out from then on.

type Burning = Partial<Light>;

/** The light with its end time, counted from `now`, if it burns for a while and has none yet. */
export function stampLight<L extends Burning>(light: L, now: number): L {
  return light.lasts && light.endsAt === undefined ? { ...light, endsAt: now + light.lasts } : light;
}

/** Whether the light has burnt out at `now`. */
export function burntOut(light: Burning, now: number): boolean {
  return light.endsAt !== undefined && light.endsAt <= now;
}
