import {
  canControlToken,
  halved,
  hitReactions,
  opportunityAttackers,
  shieldSlot,
  shielded,
  type Effect,
  type Player,
  type Point,
  type ReactionOffer,
  type Token,
} from '@vtt/shared';
import { randomUUID } from 'node:crypto';
import type { CombatActions, PendingHit } from './combat-actions.ts';
import { Refusal, type Table } from './table.ts';

export type ReactionMessage = { t: 'reactionOffer'; offer: ReactionOffer } | { t: 'reactionGone'; id: string };

/**
 * Reactions in a fight: when something gives a creature the chance to react
 * (an enemy walking out of its reach, an attack about to hit it), its
 * controllers are offered it; the offer lasts until it's taken, declined or
 * the turn passes. A hit waits for the answer before it lands.
 */
export class Reactions {
  private offers = new Map<string, ReactionOffer>();
  private hits = new Map<string, PendingHit>();

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
      const choices = sheet.attacks.filter((a) => a.kind === 'melee').map((a) => a.name);
      this.offer({ id: randomUUID(), reactor, target: mover.id, kind: 'opportunity', choices });
    }
  }

  /** An attack is about to hit: offer its target shield or uncanny dodge. True when the hit waits. */
  hit(hit: PendingHit): boolean {
    const combat = this.table.store.combat;
    const target = hit.target.token.id;
    if (!combat || combat.reacted.includes(target)) return false;
    const choices = hitReactions(hit.target, hit.outcome.roll);
    if (!choices.length) return false;
    const id = randomUUID();
    this.hits.set(id, hit);
    this.offer({
      id,
      reactor: target,
      target: hit.attacker.token.id,
      kind: 'hit',
      choices,
      total: hit.outcome.roll.total,
    });
    return true;
  }

  /** Takes or declines an offer. */
  react(player: Player, id: string, choice: string | undefined): void {
    const offer = this.offers.get(id);
    const reactor = offer && this.table.store.tokens.get(offer.reactor);
    if (!offer || !reactor) throw new Refusal('That moment has passed');
    if (!canControlToken(reactor, player)) throw new Refusal(`You don't control ${reactor.name}`);
    if (choice && !offer.choices.includes(choice)) throw new Refusal(`${reactor.name} can't ${choice} now`);
    const hit = this.hits.get(id);
    this.drop(id);
    if (hit) return this.answer(hit, choice);
    if (choice) this.combat.reactionAttack(player, { attacker: offer.reactor, target: offer.target, attack: choice });
  }

  /** The turn passed: offers not taken are gone, and waiting hits land. */
  clear(): void {
    for (const id of [...this.offers.keys()]) {
      const hit = this.hits.get(id);
      this.drop(id);
      if (hit) this.answer(hit, undefined);
    }
  }

  private answer(hit: PendingHit, choice: string | undefined): void {
    if (choice) this.table.pay(hit.target.token, 'reaction');
    if (choice === 'shield') return this.combat.land(this.shield(hit));
    if (choice === 'uncanny-dodge') {
      this.table.note(`${hit.target.token.name} uses Uncanny Dodge`);
      return this.combat.land({ ...hit, outcome: halved(hit.outcome) });
    }
    this.combat.land(hit);
  }

  /** Casts shield with the lowest slot: +5 AC until the caster's next turn, which may make the hit miss. */
  private shield(hit: PendingHit): PendingHit {
    const { token, sheet } = this.table.fighter(hit.target.token.id);
    const slot = shieldSlot(sheet);
    if (!slot) return hit;
    this.table.spendSlot(token.id, slot);
    const effect: Effect = { id: `shield-${token.id}`, name: 'Shield', ac: 5, rounds: 1, source: token.id };
    const effects = [...(token.effects ?? []).filter((e) => e.id !== effect.id), effect];
    this.table.store.setToken({ ...this.table.store.tokens.get(token.id)!, effects });
    const ac = sheet.ac + 5;
    this.table.note(`${token.name} casts Shield: AC ${ac}`);
    return hit.outcome.roll.total < ac ? { ...hit, outcome: shielded(hit.outcome) } : hit;
  }

  private offer(offer: ReactionOffer): void {
    const reactor = this.table.store.tokens.get(offer.reactor);
    if (!reactor) return;
    this.offers.set(offer.id, offer);
    this.tell({ t: 'reactionOffer', offer }, reactor);
  }

  private drop(id: string): void {
    const offer = this.offers.get(id);
    const reactor = offer && this.table.store.tokens.get(offer.reactor);
    this.offers.delete(id);
    this.hits.delete(id);
    if (reactor) this.tell({ t: 'reactionGone', id }, reactor);
  }
}
