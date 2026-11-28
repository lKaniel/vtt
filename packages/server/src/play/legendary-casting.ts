import type { Player, Point } from '@vtt/shared';
import { rollPickOf } from './roll-picks.ts';
import {
  type Legendary as LegendaryOptions,
  legendaryProblem,
  spendLegendary,
  type Spell,
  SpellSchema,
} from '@vtt/system-dnd5e';
import type { LegendaryMessage } from '../actions/legendary-actions.ts';
import type { SpellActions } from '../actions/spell-actions.ts';
import { Refusal, requireGm, type Fighter, type Table } from './table.ts';

// A legendary action that is a save action (Wing Attack, Disrupt Life) runs
// like a breath weapon, out of the creature's turn: around it, at the
// creature the GM targets, or at the point where that creature stands. One
// that casts a spell (a 2024 dragon's Frightful Presence) casts it out of
// turn with no slot, at its level and with its own DC when it names one.

type Legendary = Extract<LegendaryMessage, { t: 'legendary' }>;
type Option = LegendaryOptions['options'][number];
interface Deps {
  table: Table;
  spells: SpellActions;
}

/** Whether the legendary option is a save action run like a spell, or casts one. */
export function isLegendarySpell(table: Table, msg: LegendaryMessage): msg is Legendary {
  if (msg.t !== 'legendary') return false;
  const token = table.store.tokens.get(msg.token);
  const sheet = token && table.sheetOf(token);
  const option = sheet?.legendary?.options.find((o) => o.id === msg.option);
  return !!(option?.spell ?? option?.casts);
}

/** The point an area lands on: where the target stands, unless it spreads around the creature itself. */
function landing(table: Table, spell: Spell, target: string | undefined): Point | undefined {
  const at = target ? table.store.tokens.get(target) : undefined;
  return spell.area && spell.area.shape !== 'emanation' && at ? [at.x, at.y] : undefined;
}

/** The option's legendary actions spent, and marked when it is taken once a round. */
function spend(table: Table, caster: Fighter, option: Option): void {
  const token = table.store.tokens.get(caster.token.id)!;
  table.store.setToken(spendLegendary(token, option.cost, option.oncePerRound ? option.id : undefined));
}

export function castLegendary(deps: Deps, player: Player, canSee: (id: string) => boolean, msg: Legendary): void {
  requireGm(player);
  const { table } = deps;
  const caster = table.fighter(msg.token);
  const problem = legendaryProblem(caster.token, caster.sheet, table.store.combat, msg.option);
  if (problem) throw new Refusal(problem);
  const option = caster.sheet.legendary!.options.find((o) => o.id === msg.option)!;
  if (option.casts) return castNamed(deps, { player, canSee, msg }, caster, option);
  const spell = SpellSchema.parse({
    id: option.id,
    name: option.name,
    level: 0,
    school: 'feature',
    castingTime: 'action',
    range: 0,
    description: option.description ?? '',
    ...option.spell,
  });
  const point = landing(table, spell, msg.target);
  const aim = { caster: msg.token, spell: spell.id, slot: 0, targets: msg.target && !point ? [msg.target] : [], point };
  const targets = deps.spells.targets(caster, spell, aim, canSee);
  spend(table, caster, option);
  table.note(`${caster.token.name} takes a legendary action, ${option.name}`);
  deps.spells.strike(caster.token.id, { spell, slot: 0, point, ...rollPickOf(msg) }, targets);
}

interface LegendaryPlan {
  cost: 'free';
  slot: number;
  spend: number;
  again: boolean;
  dc?: number;
}

interface Asked {
  player: Player;
  canSee: (id: string) => boolean;
  msg: Legendary;
}

/** A legendary option that casts a spell: at the GM's target (or where it stands, for an area), or on itself. */
function castNamed({ table, spells }: Deps, { player, canSee, msg }: Asked, caster: Fighter, option: Option): void {
  const casts = option.casts!;
  const spell = table.content(caster.token).spells.get(casts.spell);
  if (!spell) throw new Refusal(`There is no spell called ${casts.spell}`);
  const around = !!casts.self || spell.area?.shape === 'emanation';
  if (!around && !msg.target) throw new Refusal(`Target a creature for ${option.name} first`);
  const point = landing(table, spell, msg.target);
  const at = msg.target && !point ? [msg.target] : [];
  const targets = casts.self ? [caster.token.id] : at;
  table.note(`${caster.token.name} takes a legendary action, ${option.name}`);
  const slot = Math.max(spell.level, casts.level ?? spell.level);
  spells.cast(player, canSee, {
    caster: caster.token.id,
    spell: spell.id,
    slot,
    targets,
    point,
    legendary: option.id,
    ...rollPickOf(msg),
  });
  spend(table, caster, option);
}

/** How a legendary option casts its spell: no action or slot, with the DC it names, else its Spellcasting's. */
export function legendaryPlan(actor: Fighter, spell: Spell, option: string): LegendaryPlan {
  const casts = actor.sheet.legendary?.options.find((o) => o.id === option)?.casts;
  if (casts?.spell !== spell.id) throw new Refusal(`${actor.token.name} can't cast ${spell.name} that way`);
  const slot = spell.level === 0 ? 0 : Math.max(spell.level, casts.level ?? spell.level);
  const dc = casts.dc ?? actor.sheet.caster?.dc;
  return { cost: 'free', slot, spend: 0, again: false, ...(dc && { dc }) };
}
