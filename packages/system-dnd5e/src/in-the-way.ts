import type { Token } from './token-schema.ts';
import type { TokenView } from './token-view.ts';

/**
 * The creatures that block `mover`'s walk: every other one on its level that
 * is still standing (a creature at 0 hp can be stepped over).
 */
export function inTheWay<T extends Token & Pick<TokenView, 'health'>>(mover: Token, tokens: Iterable<T>): T[] {
  const level = mover.elevation ?? 0;
  return [...tokens].filter((t) => t.id !== mover.id && (t.elevation ?? 0) === level && !isDown(t));
}

function isDown(t: Token & Pick<TokenView, 'health'>): boolean {
  return t.hp === 0 || t.health === 'down';
}
