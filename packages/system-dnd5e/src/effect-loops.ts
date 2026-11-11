import type { Token } from './token-schema.ts';

// Looping videos on creatures: a creature under a spell wears the spell's
// loop (the "zone:<spell>" look of the game's packs, JB2A's Bless loop), and
// one with a condition the marker named after it ("condition:<id>"). Only
// loops: a one-off burst would play once and stop. The map draws them under
// the token.

const isLoop = (src: string) => /loop/i.test(src.split('/').at(-1) ?? '');

/** The looping videos `token` wears, by `find` (the game's pack animations), each once. */
export function effectLoops(token: Token, find: (key: string) => readonly string[] | undefined): string[] {
  const keys = (token.effects ?? []).flatMap((e) => [
    ...(e.spell ? [`zone:${e.spell}`] : []),
    ...(e.conditions ?? []).map((c) => `condition:${c}`),
  ]);
  const loops = keys.map((k) => find(k)?.[0]).filter((src): src is string => !!src && isLoop(src));
  return [...new Set(loops)];
}
