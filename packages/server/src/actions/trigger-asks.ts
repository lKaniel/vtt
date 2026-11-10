import { canControl, type DrawnTile, isGm, type Player, type TriggerAction } from '@vtt/shared';
import type { Token } from '@vtt/system-dnd5e';
import { Refusal } from '../play/table.ts';

// The parts of tile triggers that involve who set them off (trigger-actions.ts):
// a tile only a creature close by can use (Monk's distance filter), and the
// questions a tile asks (Monk's dialog buttons), kept until answered.

/** How far the centre of `token` is from the tile's edge, pixels (0 on it). */
function distanceTo(tile: DrawnTile, token: Token): number {
  const dx = Math.max(tile.x - token.x, 0, token.x - (tile.x + tile.w));
  const dy = Math.max(tile.y - token.y, 0, token.y - (tile.y + tile.h));
  return Math.hypot(dx, dy);
}

/**
 * The creature that uses a tile with `near`: the one clicked with, else the
 * nearest of the player's on the scene; refused when it stands too far. The
 * GM's click needs none.
 */
export function userNear(
  tile: DrawnTile,
  player: Player,
  token: Token | undefined,
  theirs: () => Token[],
): Token | undefined {
  const near = tile.trigger?.near;
  if (near === undefined || isGm(player)) return token;
  const byDistance = (a: Token, b: Token) => distanceTo(tile, a) - distanceTo(tile, b);
  const user = token ?? theirs().sort(byDistance)[0];
  if (!user) throw new Refusal('You have no creature here to use that');
  if (distanceTo(tile, user) > near) throw new Refusal(`${user.name} is too far away to use that`);
  return user;
}

/** Who answers a question: the player who set it off, else whoever moves the creature (else the GM). */
export function askedOf(players: readonly Player[], player: string | undefined, token: Token | undefined): string[] {
  if (player) return [player];
  const movers = token ? players.filter((p) => !isGm(p) && canControl(token, p)) : [];
  return (movers.length ? movers : players.filter(isGm)).map((p) => p.id);
}

type Choice = Extract<TriggerAction, { type: 'choice' }>;

/** A question waiting for its answer. */
interface Waiting<C> {
  scene: string;
  who: string[];
  options: Choice['options'];
  ctx: C;
}

/** The questions tiles have asked, by id, until one of those asked answers. */
export class TriggerChoices<C> {
  private waiting = new Map<string, Waiting<C>>();
  private next = 1;

  /** Keeps a question; its id. */
  add(question: Waiting<C>): string {
    const id = `choice-${this.next++}`;
    this.waiting.set(id, question);
    return id;
  }

  /** The question `id`, taken by its answer from `player`. */
  take(player: string, id: string): Waiting<C> {
    const question = this.waiting.get(id);
    if (!question?.who.includes(player)) throw new Refusal('That choice is not yours');
    this.waiting.delete(id);
    return question;
  }
}
