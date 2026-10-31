import {
  canControlToken,
  opportunityAttackers,
  type Player,
  type Point,
  type ReactionOffer,
  type Token,
} from '@vtt/shared';
import { randomUUID } from 'node:crypto';
import type { CombatActions } from './combat-actions.ts';
import { Refusal, type Table } from './table.ts';

/**
 * Reactions in a fight: when something gives a creature the chance to react
 * (an enemy walking out of its reach), its controllers are offered it; the
 * offer lasts until it's taken, declined or the turn passes.
 */
export type ReactionMessage = { t: 'reactionOffer'; offer: ReactionOffer } | { t: 'reactionGone'; id: string };

export class Reactions {
  private offers = new Map<string, ReactionOffer>();

  constructor(
    private table: Table,
    private combat: CombatActions,
    private tell: (msg: ReactionMessage, reactor: Token) => void,
  ) {}

  /** `mover` walked `path`: enemies whose reach it left may attack it. */
  moved(mover: Token, path: readonly Point[]): void {
    const combat = this.table.store.combat;
    if (!combat) return;
    const others = [...this.table.store.tokens.values()].flatMap((token) => {
      const sheet = this.table.sheetOf(token);
      return sheet ? [{ token, sheet }] : [];
    });
    const gridSize = this.table.store.world.gridSize;
    for (const reactor of opportunityAttackers({ mover, path, others, gridSize, reacted: combat.reacted })) {
      const sheet = others.find((o) => o.token.id === reactor)!.sheet;
      const attacks = sheet.attacks.filter((a) => a.kind === 'melee').map((a) => a.name);
      const offer: ReactionOffer = { id: randomUUID(), reactor, target: mover.id, kind: 'opportunity', attacks };
      this.offers.set(offer.id, offer);
      this.tell({ t: 'reactionOffer', offer }, this.table.store.tokens.get(reactor)!);
    }
  }

  /** Takes or declines an offer. */
  react(player: Player, id: string, attack: string | undefined): void {
    const offer = this.offers.get(id);
    const reactor = offer && this.table.store.tokens.get(offer.reactor);
    if (!offer || !reactor) throw new Refusal('That moment has passed');
    if (!canControlToken(reactor, player)) throw new Refusal(`You don't control ${reactor.name}`);
    this.drop(id);
    if (attack) this.combat.reactionAttack(player, { attacker: offer.reactor, target: offer.target, attack });
  }

  /** The turn passed: offers not taken are gone. */
  clear(): void {
    for (const id of [...this.offers.keys()]) this.drop(id);
  }

  private drop(id: string): void {
    const offer = this.offers.get(id);
    const reactor = offer && this.table.store.tokens.get(offer.reactor);
    this.offers.delete(id);
    if (reactor) this.tell({ t: 'reactionGone', id }, reactor);
  }
}
