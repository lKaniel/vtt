import type { Content } from './content.ts';
import { resolveCreature, type Creature } from './creature.ts';
import { canControlToken } from './permissions.ts';
import type { Player, Token } from './schema.ts';

/** How hurt a creature looks to someone who can't see its hit points. */
export type Health = 'unhurt' | 'hurt' | 'bloodied' | 'down';

/** A token as one player is told about it. */
export interface TokenView extends Token {
  /** Full statistics, for the GM and the token's controllers. */
  sheet?: Creature;
  /** For everyone else, only how hurt it looks. */
  health?: Health;
  /** The monster's painted token, drawn when the token has no `img` of its own. */
  art?: string;
}

export function healthOf(hp: number, maxHp: number): Health {
  if (hp <= 0) return 'down';
  if (hp >= maxHp) return 'unhurt';
  return hp <= maxHp / 2 ? 'bloodied' : 'hurt';
}

/** What `player` may know about `token`: its sheet if they control it, else just how hurt it looks. */
export function viewToken(token: Token, player: Player, content: Content): TokenView {
  const sheet = resolveCreature(token, content);
  if (!sheet) return token;
  const art = token.monster ? content.monsters.get(token.monster)?.img : undefined;
  const look = art ? { art } : {};
  if (canControlToken(token, player)) return { ...token, ...look, sheet };
  const { monster: _m, stats: _s, hp: _h, inventory: _i, ...visible } = token;
  return { ...visible, ...look, health: healthOf(sheet.hp, sheet.maxHp) };
}
