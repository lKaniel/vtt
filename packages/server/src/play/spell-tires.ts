import type { GameStore } from '../store/game-store.ts';

// A spell or save action that tires its target (a sphinx's Weight of Years):
// exhaustion levels on top of those it has, six at most.

/** `id` gains `levels` of exhaustion. */
export function tire(store: GameStore, id: string, levels: number): void {
  const token = store.tokens.get(id);
  if (token) store.setToken({ ...token, exhaustion: Math.min(6, (token.exhaustion ?? 0) + levels) });
}
