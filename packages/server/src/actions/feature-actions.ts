import { canControl, type Player } from '@vtt/shared';
import {
  editionOf,
  escapeRoll,
  grapplesOn,
  featureProblem,
  type FeatureUse,
  itemCost,
  itemProblem,
  removeEffects,
  rechargeItems,
  rest,
  type Token,
  useFeature,
  useItem,
} from '@vtt/system-dnd5e';
import { Refusal, requireGm, type Cost, type Table } from '../play/table.ts';

/** Class features, rests, and ending effects by hand. */
export class FeatureActions {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  use(player: Player, id: string, featureId: string): void {
    const { token, sheet } = this.table.actor(player, id);
    const problem = featureProblem(sheet, featureId);
    if (problem) throw new Refusal(`${token.name} ${problem}`);
    const feature = sheet.features.find((f) => f.id === featureId)!;
    const cost: Cost = feature.action ?? 'free';
    this.table.check(token, cost);
    const out = useFeature(token, sheet, featureId, this.table.rng);
    this.table.pay(token, cost, sheet.attacksPerAction);
    this.store.setToken({ ...out.token, x: token.x, y: token.y });
    this.grant(token, out);
    const healed = out.healed !== undefined ? ` and regains ${out.healed} HP` : '';
    const rolled = out.check ? `: ${out.check.name} ${out.check.total}` : '';
    if (feature.escape) return this.escape(token.id);
    this.table.note(`${token.name} uses ${feature.name}${rolled}${healed}`);
  }

  /** A grappled creature tries to break each grapple on it. */
  private escape(id: string): void {
    const self = this.table.fighter(id);
    for (const grapple of grapplesOn(self.token)) {
      const holder = grapple.source ? this.store.tokens.get(grapple.source) : undefined;
      const grappler = holder && this.table.sheetOf(holder) && this.table.fighter(holder.id);
      const out = escapeRoll(self, grapple, grappler, this.table.rng);
      const from = holder ? ` from ${holder.name}` : '';
      const result = out.success ? 'escapes' : 'fails to escape';
      this.table.note(`${self.token.name} ${result}${from}: ${out.total} vs ${out.dc}`);
      if (out.success) this.store.setToken(removeEffects(this.store.tokens.get(id)!, new Set([grapple.id])));
    }
  }

  /** What a feature gives back this turn: the action, movement or attacks. */
  private grant(token: Token, out: FeatureUse): void {
    const left = this.table.budget(token);
    if (!left) return;
    this.table.setBudget(token, {
      ...left,
      action: left.action || !!out.grantAction,
      move: left.move + (out.dash ?? 0),
      attacks: left.attacks + (out.grantAttacks ?? 0),
    });
  }

  /** Uses up one of an item: a potion is drunk, a torch lit. */
  useItem(player: Player, id: string, itemId: string): void {
    const { token, sheet } = this.table.actor(player, id);
    const items = this.table.content(token).items;
    const item = items.get(itemId);
    const problem = itemProblem(token, item, items);
    if (problem) throw new Refusal(`${token.name} ${problem}`);
    const cost = itemCost(item!, editionOf(token, this.store.world));
    this.table.check(token, cost);
    const out = useItem(token, sheet, item!, this.table.rng);
    this.table.pay(token, cost);
    this.store.setToken(out.token);
    if (out.lit) return this.table.note(`${token.name} lights a ${out.lit}`);
    const detail = out.healed !== undefined ? ` and regains ${out.healed} HP` : '';
    this.table.note(`${token.name} uses ${item!.name}${detail}`);
  }

  /** Whether the feature is aimed like a spell, at creatures or an area. */
  aimed(id: string, featureId: string): boolean {
    const token = this.store.tokens.get(id);
    const sheet = token && this.table.sheetOf(token);
    return !!sheet?.features.find((f) => f.id === featureId)?.spell;
  }

  rest(player: Player, ids: readonly string[], kind: 'short' | 'long'): void {
    requireGm(player);
    for (const id of ids) {
      const { token, sheet } = this.table.fighter(id);
      if (kind === 'long' && token.concentration) this.table.endConcentration(id);
      const rested = rest(this.store.tokens.get(id)!, sheet, kind);
      // A long rest stands in for dawn, when wands and staffs regain their charges.
      const now = kind === 'long' ? rechargeItems(rested, this.table.content(rested), this.table.rng) : rested;
      this.store.setToken(now);
    }
    const who = ids.length === 1 ? 'A creature takes' : String(ids.length) + ' creatures take';
    this.table.note(`${who} a ${kind} rest`);
  }

  dropConcentration(player: Player, id: string): void {
    const token = this.store.tokens.get(id);
    if (!token || !this.canManage(player, id)) throw new Refusal('No such token');
    if (!token.concentration) throw new Refusal(`${token.name} isn't concentrating on anything`);
    this.table.note(`${token.name} stops concentrating on ${token.concentration.name}`);
    this.table.endConcentration(id);
  }

  removeEffect(player: Player, id: string, effect: string): void {
    requireGm(player);
    const token = this.store.tokens.get(id);
    if (!token) throw new Refusal('No such token');
    this.store.setToken(removeEffects(token, new Set([effect])));
  }

  private canManage(player: Player, id: string): boolean {
    const token = this.store.tokens.get(id);
    return !!token && canControl(token, player);
  }
}
