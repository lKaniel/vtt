import type { Player, Token } from './schema.ts';

export function canSeeToken(token: Token, player: Player): boolean {
  if (player.role === 'gm') return true;
  if (token.hidden) return false;
  if (token.visibleTo) return token.visibleTo.includes(player.id);
  return true;
}

export function canControlToken(token: Token, player: Player): boolean {
  return player.role === 'gm' || token.controllers.includes(player.id);
}
