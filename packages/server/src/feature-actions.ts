import {
  editionOf,
  featureProblem,
  itemCost,
  itemProblem,
  removeEffects,
  rest,
  useFeature,
  useItem,
  type FeatureUse,
  type Player,
  type Token,
} from '@vtt/shared';
import { Refusal, requireGm, type Cost, type Table } from './table.ts';

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
    this.table.pay(token, cost);
    this.store.setToken({ ...out.token, x: token.x, y: token.y });
    this.grant(token, out);
    const detail = out.healed !== undefined ? ` and regains ${out.healed} HP` : '';
    this.table.note(`${token.name} uses ${feature.name}${detail}`);
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

  /** Uses up one of an item: a potion is drunk. */
  useItem(player: Player, id: string, itemId: string): void {
    const { token, sheet } = this.table.actor(player, id);
    const item = this.table.content(token).items.get(itemId);
    const problem = itemProblem(token, item);
    if (problem) throw new Refusal(`${token.name} ${problem}`);
    const cost = itemCost(item!, editionOf(token, this.store.world));
    this.table.check(token, cost);
    const out = useItem(token, sheet, itemId, this.table.rng);
    this.table.pay(token, cost);
    this.store.setToken(out.token);
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
      this.store.setToken(rest(this.store.tokens.get(id)!, sheet, kind));
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
    return player.role === 'gm' || !!token?.controllers.includes(player.id);
  }
}
