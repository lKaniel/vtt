import {
  type Attack,
  type ClientMessage,
  type CritChoice,
  type D20Mode,
  featureSpell,
  type FeatureSheet,
  proficiencyName,
  type RollAsk,
  type RollChoice,
  skillName,
  type Spell,
  type Spend,
  type TokenView,
} from '@vtt/system-dnd5e';
import { contentFor } from '../content/content.ts';
import { type PaymentOption, paymentOptions } from './payments.ts';

// What the roll dialog offers for an action about to be sent (an attack, a
// spell, a feature, a check or save), and the message the action becomes
// once the player has picked. Only what differs from the defaults is sent,
// so an action confirmed untouched is the action as it was.

/** The actions that wait for the dialog. */
export type Asked = Extract<ClientMessage, { t: 'attack' | 'cast' | 'feature' | 'rollCheck' }>;

/** What is about to happen, for the dialog's title. */
export interface RollWhat {
  kind: 'attack' | 'spell' | 'feature' | 'check' | 'save';
  name: string;
  /** The creature it goes at, by name, when it is one. */
  target?: string;
}

export interface RollPlan {
  msg: Asked;
  what: RollWhat;
  /** The d20 the creature rolls itself, to ask the server how it would be rolled; none: it rolls no d20. */
  ask?: RollAsk;
  /** The roll is an attack roll: a hit can be made a critical, or kept from being one. */
  crit: boolean;
  /** It deals damage that can be added to or set. */
  damage: boolean;
  /** What it spends of the turn as things stand; none: nothing to choose (outside a fight, or it costs nothing). */
  spend?: Spend;
  /** The ways to pay for a cast, when there is more than one. */
  payments?: PaymentOption[];
}

/** What the plan is made from: the creatures on the table, and whether turns are being counted. */
export interface PlanContext {
  tokens: ReadonlyMap<string, TokenView>;
  fighting: boolean;
}

/** What the player picked in the dialog. */
export interface RollPicked {
  d20?: D20Mode;
  crit?: CritChoice;
  situational?: string;
  damageExtra?: string;
  damageSet?: number;
  spend?: Spend;
  payment?: PaymentOption;
}

type Message<K extends Asked['t']> = Extract<Asked, { t: K }>;

const CAST_SPENDS: Record<Spell['castingTime'], Spend | undefined> = {
  action: 'action',
  bonus: 'bonus',
  reaction: 'reaction',
  minute: undefined,
  hour: undefined,
};

/** A creature's name when the action goes at exactly one. */
function oneTarget(ctx: PlanContext, ids: readonly string[] | undefined): string | undefined {
  return ids?.length === 1 ? ctx.tokens.get(ids[0]!)?.name : undefined;
}

function attackPlan(msg: Message<'attack'>, ctx: PlanContext): RollPlan | undefined {
  const attack: Attack | undefined = ctx.tokens.get(msg.attacker)?.sheet?.attacks.find((a) => a.name === msg.attack);
  if (!attack) return undefined;
  const { target } = msg;
  const offHand = attack.offHand ? 'bonus' : 'action';
  return {
    msg,
    what: { kind: 'attack', name: attack.name, target: oneTarget(ctx, target ? [target] : []) },
    ask: target ? { kind: 'attack', attacker: msg.attacker, target, attack: attack.name } : undefined,
    crit: !!target,
    damage: !!target && attack.damage.length > 0,
    spend: ctx.fighting ? offHand : undefined,
  };
}

/** The spell a creature casts: one it knows, else one from the books (a scroll's, an item's). */
function spellOf(token: TokenView, id: string): Spell | undefined {
  return token.sheet?.caster?.spells.find((s) => s.id === id) ?? contentFor(token).spells.get(id);
}

/** Whether the caster rolls to hit with the spell: it attacks, can miss, and has someone to go at. */
const rollsToHit = (spell: Spell, targets: readonly string[]) => !!spell.attack && !spell.autoHit && targets.length > 0;

function castPlan(msg: Message<'cast'>, ctx: PlanContext): RollPlan | undefined {
  const token = ctx.tokens.get(msg.caster);
  const spell = token && spellOf(token, msg.spell);
  if (!token || !spell) return undefined;
  const attacks = rollsToHit(spell, msg.targets);
  const own = !msg.scroll && msg.item === undefined && !msg.repeat;
  const payments = own ? paymentOptions(token, spell, msg.slot) : [];
  const cost = msg.repeat ? (spell.repeat as Spend | undefined) : CAST_SPENDS[spell.castingTime];
  return {
    msg,
    what: { kind: 'spell', name: spell.name, target: oneTarget(ctx, msg.targets) },
    ask: attacks ? { kind: 'spell', caster: msg.caster, spell: spell.id, target: msg.targets[0]! } : undefined,
    crit: attacks,
    damage: spell.damage.length > 0,
    spend: ctx.fighting ? cost : undefined,
    ...(payments.length > 1 && { payments }),
  };
}

/** What a feature spends as things stand: a pool feature used as a bonus action, else its own action. */
function featureSpend(msg: Message<'feature'>, feature: FeatureSheet): Spend | undefined {
  if (msg.bonus) return 'bonus';
  return feature.action === 'attack' ? 'action' : feature.action;
}

function featurePlan(msg: Message<'feature'>, ctx: PlanContext): RollPlan | undefined {
  const feature = ctx.tokens.get(msg.token)?.sheet?.features.find((f) => f.id === msg.feature);
  if (!feature) return undefined;
  const aimed = msg.targets !== undefined || msg.point !== undefined;
  const spell = aimed ? featureSpell(feature) : undefined;
  const targets = msg.targets ?? [];
  const attacks = !!spell && rollsToHit(spell, targets);
  return {
    msg,
    what: { kind: 'feature', name: feature.name, target: oneTarget(ctx, targets) },
    ask: attacks ? { kind: 'spell', caster: msg.token, spell: spell.id, target: targets[0]! } : undefined,
    crit: attacks,
    damage: !!spell && spell.damage.length > 0,
    spend: ctx.fighting ? featureSpend(msg, feature) : undefined,
  };
}

function checkPlan(msg: Message<'rollCheck'>): RollPlan {
  const { ability, skill } = msg;
  const { save, tool } = msg as { save?: boolean; tool?: string };
  const subject = tool ? proficiencyName(tool) : ability.toUpperCase();
  return {
    msg,
    what: { kind: save ? 'save' : 'check', name: skill ? skillName(skill) : subject },
    ask: {
      kind: 'check',
      token: msg.token,
      ability,
      ...(skill && { skill }),
      ...(save && { save }),
      ...(tool && { tool }),
    },
    crit: false,
    damage: false,
  };
}

function planOf(msg: ClientMessage, ctx: PlanContext): RollPlan | undefined {
  if (msg.t === 'attack') return attackPlan(msg, ctx);
  if (msg.t === 'cast') return castPlan(msg, ctx);
  if (msg.t === 'feature') return featurePlan(msg, ctx);
  return msg.t === 'rollCheck' ? checkPlan(msg) : undefined;
}

/** What the dialog offers for `msg`; undefined when it is not an action it asks about, or there is nothing to pick. */
export function planFor(msg: ClientMessage, ctx: PlanContext): RollPlan | undefined {
  const plan = planOf(msg, ctx);
  const any = plan && (plan.ask || plan.damage || plan.spend || plan.payments);
  return any ? plan : undefined;
}

/** The d20 the dialog starts on: a quick pick sent with the action, else the server's default once it is known. */
export function startingD20(plan: RollPlan, standing: D20Mode | undefined): D20Mode {
  return (plan.msg as RollChoice).edge ?? standing ?? 'normal';
}

/** The roll picks that differ from how the action would go anyway. */
function pickedChoice(plan: RollPlan, picked: RollPicked, standing: D20Mode | undefined): RollChoice {
  const d20 = plan.ask && picked.d20 && picked.d20 !== (standing ?? 'normal') ? picked.d20 : undefined;
  const situational = plan.ask ? picked.situational?.replace(/\s+/g, '') : undefined;
  const damageExtra = plan.damage ? picked.damageExtra?.replace(/\s+/g, '') : undefined;
  return {
    ...(d20 && { d20 }),
    ...(plan.crit && picked.crit && { crit: picked.crit }),
    ...(situational && { situational }),
    ...(damageExtra && { damageExtra }),
    ...(plan.damage && picked.damageSet !== undefined && { damageSet: picked.damageSet }),
    ...(picked.spend && picked.spend !== plan.spend && { spend: picked.spend }),
  };
}

/** A cast paid as picked: a slot of that level, a feature, or nothing. */
function paid(msg: Asked, payment: PaymentOption | undefined): Asked {
  if (msg.t !== 'cast' || !payment) return msg;
  const { paidBy: _paidBy, free: _free, ...cast } = msg;
  const { slot, paidBy, free } = payment;
  return { ...cast, slot, ...(paidBy && { paidBy }), ...(free && { free }) };
}

/** The action as it is sent once the player has picked; `standing`: how the d20 would be rolled anyway. */
export function pickedMessage(plan: RollPlan, picked: RollPicked, standing: D20Mode | undefined): Asked {
  const { edge: _edge, crit: _crit, ...action } = paid(plan.msg, picked.payment) as Asked & RollChoice;
  return { ...action, ...pickedChoice(plan, picked, standing) } as Asked;
}
