import type { Token } from './token-schema.ts';

// Reverse gravity: creatures it lifts rise while it lasts (their elevation,
// kept by the server as `aloft`), and fall back when it ends.

/** The token raised or dropped to what its effects lift it now, and how far it fell; undefined when nothing changes. */
export function withGravity(token: Token): { token: Token; fell?: number } | undefined {
  const want = Math.max(0, ...(token.effects ?? []).map((e) => e.lifted ?? 0));
  const have = token.aloft ?? 0;
  if (want === have) return undefined;
  const elevation = Math.max(0, (token.elevation ?? 0) + want - have);
  const moved = { ...token, elevation: elevation || undefined, aloft: want || undefined };
  return want > have ? { token: moved } : { token: moved, fell: have - want };
}
