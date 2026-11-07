import { bare, str } from './srd-convert.ts';
import type { ItemEntry } from './item-convert.ts';
import { itemCasts } from './item-casts-convert.ts';

// What the SRD packs automate on an item, as our fields: an effect while it
// is worn, bonuses, damage riders, and what drinking or reading it does.
// The packs describe effects in their own little language; the common
// patterns are read here and everything else lands in `missed`, for the
// report and the hand-written overlay.

interface PackEffect {
  target: unknown;
  op: string;
  value?: unknown;
  when?: unknown;
  tags?: unknown[];
  scope?: string;
  duration?: { amount?: number; unit?: string };
}

type Rec = Record<string, unknown>;
export interface ItemParts {
  effect?: Rec;
  bonus?: Record<string, number>;
  hitDamage?: Rec[];
  casts?: unknown[];
  charges?: Rec;
  dc?: number;
  /** A weapon's +N, when the packs write it as effects on its own rolls. */
  plus?: number;
  use?: Rec;
  missed: string[];
}

interface Ctx {
  /** The variant's pick: a damage type or a dragon colour. */
  pick?: string;
}

const DRAGONS: Record<string, string> = {
  black: 'acid',
  blue: 'lightning',
  brass: 'fire',
  bronze: 'lightning',
  copper: 'acid',
  gold: 'fire',
  green: 'poison',
  red: 'fire',
  silver: 'cold',
  white: 'cold',
};
const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ROUNDS: Record<string, number> = { round: 1, minute: 10, hour: 600, day: 14400 };

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const add = (o: Rec, key: string, n: number) => (o[key] = ((o[key] as number | undefined) ?? 0) + n);
const push = (o: Rec, key: string, ...v: unknown[]) =>
  (o[key] = [...new Set([...((o[key] as unknown[] | undefined) ?? []), ...v])]);
/** A number or a string as text; anything else as nothing. */
const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const isDice = (v: unknown) => typeof v === 'string' && /^\d*d\d+([+-]\d+)?$/.test(v.replace(/\s+/g, ''));

/** A damage type the effect's value or tags name, picks filled in. */
function damageTypeOf(v: unknown, ctx: Ctx): string | undefined {
  const tag = (v as Rec | undefined)?.tag ?? v;
  if (typeof tag === 'string' && tag.startsWith('damage.')) return tag.slice(7);
  const f = str((v as Rec | undefined)?.formula) ?? '';
  if (!ctx.pick) return undefined;
  if (f.includes('indexOf')) return DRAGONS[ctx.pick];
  if (f.includes('pick.value') || f.includes('self.damageType')) return ctx.pick.replace(/^damage\./, '');
  return undefined;
}

type Rule = (e: PackEffect, out: Out, ctx: Ctx) => boolean;
interface Out {
  plus: { attack?: number; damage?: number };
  effect: Rec;
  bonus: Record<string, number>;
  hitDamage: Rec[];
}

const target = (e: PackEffect) => (typeof e.target === 'string' ? e.target : undefined);
const rolls = (e: PackEffect) => ((e.target as Rec | undefined)?.rolls as string[] | undefined) ?? [];

const SCORE_MODE: Record<string, string> = { atLeast: 'upgrade', add: 'add', set: 'override', atMost: 'downgrade' };

/** "min(2, max(0, 20 - abilities.str.base))": +2, at most 20 (ioun stones, manuals). */
const CAPPED = /^min\((\d+),\s*max\(0,\s*(\d+)\s*-\s*abilities\.\w+\.base\)\)$/;

const abilityScore: Rule = (e, out) => {
  const m = /^abilities\.(\w+)\.score$/.exec(target(e) ?? '');
  if (!m || !ABILITIES.includes(m[1]!)) return false;
  const key = `abilities.${m[1]}`;
  const capped = CAPPED.exec(String(e.value).replace(/\s+/g, ' '));
  if (capped) {
    push(out.effect, 'changes', { key, mode: 'add', value: Number(capped[1]) });
    push(out.effect, 'changes', { key, mode: 'downgrade', value: Number(capped[2]) });
    return true;
  }
  const mode = SCORE_MODE[e.op];
  if (!mode || num(e.value) === undefined) return false;
  push(out.effect, 'changes', { key, mode, value: num(e.value) });
  return true;
};

const SPEEDS: Record<string, string> = {
  'combat.flySpeed': 'fly',
  'combat.swimSpeed': 'swim',
  'combat.climbSpeed': 'climb',
};

const speed: Rule = (e, out) => {
  const t = target(e);
  if (t === 'combat.speed') return walkSpeed(e, out);
  if (t === 'combat.hover') {
    out.effect.speeds = { ...(out.effect.speeds as Rec), hover: true };
    return true;
  }
  const kind = t && SPEEDS[t];
  if (!kind || !['atLeast', 'set'].includes(e.op)) return false;
  const value = num(e.value) ?? (String(e.value).includes('speed') ? 'walk' : undefined);
  if (value === undefined) return false;
  out.effect.speeds = { ...(out.effect.speeds as Rec), [kind]: value };
  return true;
};

function walkSpeed(e: PackEffect, out: Out): boolean {
  const n = num(e.value);
  if (n === undefined) return false;
  if (e.op === 'add') add(out.effect, 'speed', n);
  else if (e.op === 'multiply') out.effect.speedTimes = n;
  else if (e.op === 'atLeast' || e.op === 'set')
    push(out.effect, 'changes', { key: 'speed', mode: e.op === 'set' ? 'override' : 'upgrade', value: n });
  else return false;
  return true;
}

const senses: Rule = (e, out) => {
  const m = /^senses\.(darkvision|truesight|blindsight|tremorsense)$/.exec(target(e) ?? '');
  if (!m || num(e.value) === undefined) return false;
  out.effect.senses = { ...(out.effect.senses as Rec), [m[1]!]: num(e.value) };
  return true;
};

const defenses: Rule = (e, out, ctx) => {
  const t = target(e);
  if (t !== 'damage.resistances' && t !== 'damage.immunities') return false;
  const type = damageTypeOf(e.value, ctx);
  if (!type) return false;
  push(out.effect, t === 'damage.resistances' ? 'resistances' : 'immunities', type);
  return true;
};

const incoming: Rule = (e, out) => {
  const inc = (e.target as Rec | undefined)?.incoming as Rec | undefined;
  const tag = (inc?.tags as string[] | undefined)?.[0];
  if (!tag?.startsWith('damage.') || e.op !== 'multiply') return false;
  if (e.value === 0.5) push(out.effect, 'resistances', tag.slice(7));
  else if (e.value === 0) push(out.effect, 'immunities', tag.slice(7));
  else return false;
  return true;
};

const SKILL = /^skill\.([a-z-]+)$/;

/** Advantage on saves, checks and skills. */
const advantage: Rule = (e, out) => {
  if (e.op !== 'rollModifier' || (e.value as Rec | undefined)?.kind !== 'advantage') return false;
  const list = rolls(e);
  if (!list.length) return false;
  for (const r of list) if (!advantageOn(r, out)) return false;
  return true;
};

function advantageOn(r: string, out: Out): boolean {
  if (r === 'save') return !!push(out.effect, 'saveAdvantage', ...ABILITIES);
  const [kind, which] = r.split('.') as [string, string | undefined];
  if (kind === 'save' && ABILITIES.includes(which ?? '')) return !!push(out.effect, 'saveAdvantage', which);
  if (kind === 'check' && ABILITIES.includes(which ?? '')) return !!push(out.effect, 'checkAdvantageFor', which);
  const skill = SKILL.exec(r)?.[1];
  if (skill) return !!push(out.effect, 'checkAdvantageFor', skill);
  if (r === 'initiative') return !!push(out.effect, 'checkAdvantageFor', 'initiative');
  return false;
}

const saveBonus: Rule = (e, out) => {
  const where = ((e.target as Rec | undefined)?.fields as Rec | undefined)?.where;
  const n = e.op === 'add' ? num(e.value) : undefined;
  if (n === undefined) return false;
  const only = rolls(e).length === 1 ? rolls(e)[0] : undefined;
  // The packs write a save bonus twice, for the sheet and for the roll.
  if (where === "'save' in item.tags" || only === 'save') out.bonus.saves = Math.max(out.bonus.saves ?? 0, n);
  else if (only === 'check') out.effect.checkBonus = String(n);
  // Death saves follow the other saves.
  else return only === 'save.death';
  return true;
};

/** Dice added to attacks and saves for a while (potion of heroism). */
const rollDice: Rule = (e, out) => {
  if (e.op !== 'add' || !isDice(e.value) || (e.target as Rec | undefined)?.from) return false;
  const list = rolls(e);
  if (!list.length || !list.every((r) => r === 'attack' || r === 'save')) return false;
  const dice = String(e.value).replace(/\s+/g, '');
  if (list.includes('attack')) out.effect.attackBonus = dice;
  if (list.includes('save')) out.effect.saveBonus = dice;
  return true;
};

const spellBonus: Rule = (e, out) => {
  const n = num(e.value);
  if (e.op !== 'add' || n === undefined) return false;
  if (rolls(e).length === 1 && rolls(e)[0] === 'attack.spell') return !!add(out.bonus, 'spellAttack', n);
  if (target(e) === 'items.spellSave') return !!add(out.bonus, 'spellDc', n);
  return false;
};

/** "...creature.type == 'dragon'" or "in ['fiend', 'undead']": the types a rider only hits. */
function versus(when: unknown): string[] | undefined {
  const w = text(when);
  const one = /creature\.type == '([a-z]+)'/.exec(w);
  if (one) return [one[1]!];
  const many = /creature\.type in \[([^\]]*)\]/.exec(w);
  return many ? [...many[1]!.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!) : undefined;
}

const KNOWN_WHEN = /^(self\.(equipped|attuned|ignited|active)(\s*&&\s*self\.(equipped|attuned))*)?$/;

/** The rider's damage type: named, or the weapon's own ("damageType" in its formula). */
function riderType(tag: unknown, ctx: Ctx): string | undefined {
  const named = damageTypeOf(tag, ctx);
  if (named) return named;
  return text((tag as Rec | undefined)?.formula).includes('damageType') ? 'weapon' : undefined;
}

/** Extra damage on hits with the weapon (flame tongue, dragon slayer, vicious weapon). */
const rider: Rule = (e, out, ctx) => {
  const list = rolls(e);
  if (e.op !== 'add' || !list.length || !list.every((r) => r === 'damage' || r === 'damage.weapon')) return false;
  if (!isDice(e.value) && !(num(e.value) && versus(e.when))) return false;
  const type = riderType(e.tags?.[0], ctx);
  const vs = versus(e.when);
  if (!type || (!vs && !KNOWN_WHEN.test(text(e.when).trim()))) return false;
  out.hitDamage.push({ dice: String(e.value).replace(/\s+/g, ''), type, ...(vs && { vs }) });
  return true;
};

const flags: Rule = (e, out) => {
  const t = target(e);
  if (t === 'combat.ac' && e.op === 'add' && num(e.value) !== undefined) return !!add(out.effect, 'ac', num(e.value)!);
  if (t === 'hp.max' && e.op === 'add' && num(e.value) !== undefined) return !!add(out.effect, 'maxHp', num(e.value)!);
  const FLAGS: Record<string, string> = {
    'combat.attackersDisadvantage': 'disadvantageAgainst',
    'combat.noCriticals': 'noCrits',
    'items.magicSaveAdvantage': 'spellSaveAdvantage',
    'items.spellSaveAdvantage': 'spellSaveAdvantage',
  };
  const flag = t && FLAGS[t];
  if (!flag || e.value !== true) return false;
  out.effect[flag] = true;
  return true;
};

const ATTACKS = new Set(['attack', 'attack.melee', 'attack.ranged']);

/** A magic staff's +1 written as effects: numbers added to its own attack or damage rolls. */
const weaponPlus: Rule = (e, out) => {
  const n = num(e.value);
  const list = rolls(e);
  if (e.op !== 'add' || !n || !list.length || e.when) return false;
  if (list.every((r) => ATTACKS.has(r))) out.plus.attack = n;
  else if (list.every((r) => r === 'damage' || r === 'damage.weapon')) out.plus.damage = n;
  else return false;
  return true;
};

/** Spell costs and at-will spells: read by item-casts-convert.ts. */
const casting: Rule = (e) =>
  target(e) === 'spells.atWill' ||
  !!((e.target as Rec | undefined)?.choices as string[] | undefined)?.includes('spell-cost');

/** Grants that need nothing more from us: proficiency with the weapon an item already makes you use well. */
const harmless: Rule = (e) => target(e) === 'proficiencies.weapons';

const RULES: Rule[] = [
  abilityScore,
  speed,
  senses,
  defenses,
  incoming,
  advantage,
  saveBonus,
  rollDice,
  spellBonus,
  rider,
  weaponPlus,
  casting,
  flags,
  harmless,
];

function describe(e: PackEffect): string {
  return `${JSON.stringify(e.target)} ${e.op} ${JSON.stringify(e.value)}`.slice(0, 160);
}

function fold(effects: readonly PackEffect[], ctx: Ctx, missed: string[]): Out {
  const out: Out = { plus: {}, effect: {}, bonus: {}, hitDamage: [] };
  for (const e of effects) if (!RULES.some((rule) => rule(e, out, ctx))) missed.push(describe(e));
  return out;
}

function rounds(e: readonly PackEffect[]): number | undefined {
  const d = e.find((x) => x.duration)?.duration;
  const per = d?.unit ? ROUNDS[d.unit] : undefined;
  return per ? (d!.amount ?? 1) * per : undefined;
}

/** Effects that land when the item is used (a potion), with how long they last. */
function applied(e: ItemEntry, ctx: Ctx, missed: string[]): Rec | undefined {
  const list = (e.effects ?? []).filter((x) => (x as PackEffect).scope === 'applied') as PackEffect[];
  const f = e.fields ?? {};
  const condition = str(f.condition);
  if (!list.length && !condition) return undefined;
  const effect = fold(list, ctx, missed).effect;
  if (condition) {
    effect.conditions = [bare(condition)];
    if (bare(condition) === 'invisible') effect.endsOnAttack = true;
  }
  if (!Object.keys(effect).length) return undefined;
  const r = rounds(list) ?? (condition === 'conditions.invisible' ? 600 : undefined);
  return { ...effect, ...(r && { rounds: r }) };
}

const READ = /^abilities\.\w+\.(score|base|max)$/;

/** Reading the book raises the score for good (a manual, a tome). */
function raise(e: ItemEntry): Rec | undefined {
  if (!e.actions?.some((a) => a.use === 'study-book')) return undefined;
  const m = /^abilities\.(\w+)\.(score|base)$/.exec(str((e.effects?.[0] as PackEffect | undefined)?.target) ?? '');
  return m ? { ability: m[1], by: 2 } : undefined;
}

function isPotion(e: ItemEntry): boolean {
  return e.fields?.category === 'potion' || !!e.actions?.some((a) => a.use === 'drink-potion' || a.id === 'drink');
}

function useOf(e: ItemEntry, ctx: Ctx, missed: string[]): Rec | undefined {
  const f = e.fields ?? {};
  const potion = isPotion(e);
  const heal = typeof f.healing === 'string' ? f.healing.replace(/\s+/g, '') : undefined;
  const tempHp = typeof f.tempHp === 'number' ? f.tempHp : undefined;
  const effect = applied(e, ctx, missed);
  const raised = raise(e);
  const use = { heal, tempHp, effect, raise: raised };
  if (Object.values(use).every((v) => !v)) return undefined;
  return { ...pruned(use), ...(potion && { potion: true }) };
}

/** The fields that are set. */
const pruned = (o: Rec): Rec => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== 0));

/** Effects a pick adds (a ring of resistance's damage type). */
function picked(e: ItemEntry, pick: string): PackEffect[] {
  return (e.choices ?? []).flatMap((c) => {
    const choice = c as { effects?: PackEffect[]; from?: { options?: { id: string; effects?: PackEffect[] }[] } };
    const option = choice.from?.options?.find((o) => o.id === pick);
    return option ? (option.effects ?? []) : (choice.effects ?? []);
  });
}

function plusOf({ plus }: Out, missed: string[]): { plus?: number } {
  if (plus.attack === undefined && plus.damage === undefined) return {};
  if (plus.attack === plus.damage) return { plus: plus.attack };
  missed.push(`attack +${plus.attack ?? 0}, damage +${plus.damage ?? 0}`);
  return {};
}

/** Everything the packs say an item does, as our fields, and what we couldn't read. */
export function itemEffects(e: ItemEntry, ctx: Ctx): ItemParts {
  const missed: string[] = [];
  const passive = [...(e.effects ?? []), ...(ctx.pick ? picked(e, ctx.pick) : [])].filter(
    (x) => (x as PackEffect).scope !== 'applied' && !(raise(e) && READ.test(str((x as PackEffect).target) ?? '')),
  ) as PackEffect[];
  const out = fold(passive, ctx, missed);
  const use = useOf(e, ctx, missed);
  const hasEffect = Object.keys(out.effect).length > 0;
  return {
    ...(hasEffect && { effect: out.effect }),
    ...(Object.keys(out.bonus).length && { bonus: out.bonus }),
    ...(out.hitDamage.length && { hitDamage: out.hitDamage }),
    ...plusOf(out, missed),
    ...(use && { use }),
    ...itemCasts(e),
    missed,
  };
}
