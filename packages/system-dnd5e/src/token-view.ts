import type { Content } from './content.ts';
import { type Creature, resolveCreature } from './creature.ts';
import { canObserve, type Player, type Senses } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import { sensesOf } from './perception.ts';

/** How hurt a creature looks to someone who can't see its hit points. */
export type Health = 'unhurt' | 'hurt' | 'bloodied' | 'down';

/** A token as one player is told about it. */
export interface TokenView extends Token {
  /** Full statistics, for the GM and the token's owners and observers. */
  sheet?: Creature;
  /** For everyone else, only how hurt it looks. */
  health?: Health;
  /** The monster's painted token, drawn when the token has no `img` of its own. */
  art?: string;
  /** What it perceives, for its controllers: the map draws their darkvision and blindsight. */
  senses?: Senses;
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
  if (canObserve(token, player)) {
    const senses = sensesOf(token, token.monster ? content.monsters.get(token.monster) : undefined);
    return { ...token, ...look, sheet, senses };
  }
  const { monster: _m, stats: _s, hp: _h, tempHp: _t, inventory: _i, ...visible } = token;
  return { ...visible, ...look, health: healthOf(sheet.hp, sheet.maxHp) };
}
