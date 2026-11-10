import { canControl, gridKind, type Player, type Point } from '@vtt/shared';
import {
  automationOf,
  type Effect,
  halved,
  hitReactions,
  opportunityAttackers,
  COUNTERSPELL,
  type ReactionOffer,
  type RollChoice,
  shielded,
  shieldSlot,
  type Token,
} from '@vtt/system-dnd5e';
import { randomUUID } from 'node:crypto';
import type { CombatActions, PendingHit } from '../actions/combat-actions.ts';
import type { PendingCast } from '../actions/spell-actions.ts';
import { counter, spellAnswerers } from './counter-casts.ts';
import { focusArt } from './focus-art-reactions.ts';
import { guard, hitGuards } from './pool-guards.ts';
import { asksReactions, deciderOf } from './reaction-deciders.ts';
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
  private casts = new Map<string, PendingCast>();

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
    const { world } = this.table.store;
    const scale = { gridSize: world.gridSize, grid: gridKind(world) };
    for (const reactor of opportunityAttackers({ mover, path, others, ...scale, reacted: combat.reacted })) {
      const { token, sheet } = others.find((o) => o.token.id === reactor)!;
      const choices = sheet.attacks.filter((a) => a.kind === 'melee').map((a) => a.name);
      this.opportunity(token, mover, choices);
    }
  }

  /** Offers an opportunity attack, or takes or skips it as the reactor's player asked (automation.ts). */
  private opportunity(reactor: Token, mover: Token, choices: string[]): void {
    const player = this.decider(reactor);
    const how = automationOf(player?.settings).opportunity;
    if (how === 'never' || !choices.length) return;
    if (how === 'auto' && player) {
      return this.combat.reactionAttack(player, { attacker: reactor.id, target: mover.id, attack: choices[0]! });
    }
    this.offer({ id: randomUUID(), reactor: reactor.id, target: mover.id, kind: 'opportunity', choices });
  }

  private decider(reactor: Token): Player | undefined {
    return deciderOf(this.table, reactor);
  }

  /** An attack is about to hit: offer its target shield or uncanny dodge. True when the hit waits. */
  hit(hit: PendingHit): boolean {
    const combat = this.table.store.combat;
    const target = hit.target.token.id;
    if (!combat || combat.reacted.includes(target)) return false;
    if (!this.asks(hit.target.token)) return false;
    const guards = hitGuards(hit);
    const choices = [...hitReactions(hit.target, hit.outcome.roll), ...guards.reactions.map((r) => r.feature.id)];
    if (!choices.length) return false;
    const id = randomUUID();
    this.hits.set(id, hit);
    this.offer({
      id,
      reactor: target,
      target: hit.attacker.token.id,
      kind: 'hit',
      choices,
      ...(guards.reactions.length && { labels: guards.labels }),
      total: hit.outcome.roll.total,
    });
    return true;
  }

  /** A spell is being cast in a fight: enemies who could counter it are asked. True when it waits. */
  cast(pending: PendingCast): boolean {
    const combat = this.table.store.combat;
    if (!combat) return false;
    const asked = spellAnswerers(this.table, pending, combat.reacted).filter((t) => this.asks(t));
    for (const token of asked) {
      const id = randomUUID();
      this.casts.set(id, pending);
      const target = pending.caster.token.id;
      this.offer({ id, reactor: token.id, target, kind: 'spell', choices: [COUNTERSPELL], spell: pending.spell.name });
    }
    return asked.length > 0;
  }

  private asks(reactor: Token): boolean {
    return asksReactions(this.table, reactor);
  }

  /** Takes or declines an offer; `pick` is the reactor's roll pick for an opportunity attack. */
  react(player: Player, id: string, choice: string | undefined, pick: RollChoice = {}): void {
    const offer = this.offers.get(id);
    const reactor = offer && this.table.store.tokens.get(offer.reactor);
    if (!offer || !reactor) throw new Refusal('That moment has passed');
    if (!canControl(reactor, player)) throw new Refusal(`You don't control ${reactor.name}`);
    if (choice && !offer.choices.includes(choice)) throw new Refusal(`${reactor.name} can't ${choice} now`);
    const hit = this.hits.get(id);
    const cast = this.casts.get(id);
    this.drop(id);
    if (hit) return this.answer(hit, choice);
    if (cast) return this.answerCast(cast, offer.reactor, choice);
    if (choice)
      this.combat.reactionAttack(player, { attacker: offer.reactor, target: offer.target, attack: choice }, pick);
  }

  /** The turn passed: offers not taken are gone, and waiting hits land. */
  clear(): void {
    for (const id of [...this.offers.keys()]) {
      const hit = this.hits.get(id);
      const cast = this.casts.get(id);
      this.drop(id);
      if (hit) this.answer(hit, undefined);
      if (cast && !this.waiting(cast)) cast.go();
    }
  }

  /** Counterspell taken (the others asked aren't any more), or declined: the cast goes on once no one else may answer. */
  private answerCast(cast: PendingCast, reactor: string, choice: string | undefined): void {
    if (!choice) {
      if (!this.waiting(cast)) cast.go();
      return;
    }
    for (const [id, c] of this.casts) if (c === cast) this.drop(id);
    counter(this.table, reactor, cast);
  }

  private waiting(cast: PendingCast): boolean {
    return [...this.casts.values()].includes(cast);
  }

  private answer(hit: PendingHit, choice: string | undefined): void {
    if (choice) this.table.pay(hit.target.token, 'reaction');
    if (choice === 'shield') return this.combat.land(this.shield(hit));
    if (choice === 'uncanny-dodge') {
      this.table.note(`${hit.target.token.name} uses Uncanny Dodge`);
      return this.combat.land({ ...hit, outcome: halved(hit.outcome) });
    }
    const pool = choice && hitGuards(hit).reactions.find((r) => r.feature.id === choice);
    if (pool) return this.combat.land(guard(this.table, hit, pool));
    this.combat.land(choice ? focusArt(this.table, hit, choice) : hit);
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
    this.casts.delete(id);
    if (reactor) this.tell({ t: 'reactionGone', id }, reactor);
  }
}
