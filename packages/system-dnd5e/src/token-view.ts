import type { Content } from './content.ts';
import { type Creature, resolveCreature } from './creature.ts';
import { canObserve, type Player, type Senses } from '@vtt/shared';
import type { Token } from './token-schema.ts';
import { sensesOf } from './perception.ts';
import { type AuraRing, auraRings } from './auras.ts';
import { disguised } from './disguise.ts';

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
  /** The auras it gives off, drawn round it for everyone who sees it. */
  auras?: AuraRing[];
  /** Looping videos it wears for the spells and conditions on it (effect-loops.ts), from the game's packs. */
  loops?: string[];
}

export function healthOf(hp: number, maxHp: number): Health {
  if (hp <= 0) return 'down';
  if (hp >= maxHp) return 'unhurt';
  return hp <= maxHp / 2 ? 'bloodied' : 'hurt';
}

/** What `player` may know about `token`: its sheet if they control it, else just how hurt it looks and the look it wears. */
export function viewToken(token: Token, player: Player, content: Content): TokenView {
  if (canObserve(token, player)) return fullView(token, content);
  return disguised(outsideView(token, content));
}

function fullView(token: Token, content: Content): TokenView {
  const sheet = resolveCreature(token, content);
  if (!sheet) return token;
  const senses = sheet.senses ?? sensesOf(token, token.monster ? content.monsters.get(token.monster) : undefined);
  return { ...token, ...lookOf(token, sheet, content), sheet, senses };
}

/** The monster's painted token and the auras it gives off, which everyone who sees it sees. */
function lookOf(token: Token, sheet: Creature, content: Content) {
  const art = token.monster ? content.monsters.get(token.monster)?.img : undefined;
  const auras = auraRings({ token, sheet });
  return { ...(art && { art }), ...(auras.length && { auras }) };
}

function outsideView(token: Token, content: Content): TokenView {
  const sheet = resolveCreature(token, content);
  if (token.pile?.locked) {
    const { inventory: _i, currency: _c, ...shut } = token;
    return shut;
  }
  if (!sheet) return token;
  const {
    monster: _m,
    stats: _s,
    hp: _h,
    tempHp: _t,
    inventory: _i,
    own: _o,
    currency: _c,
    biography: _b,
    ...visible
  } = token;
  return { ...visible, ...lookOf(token, sheet, content), health: healthOf(sheet.hp, sheet.maxHp) };
}
