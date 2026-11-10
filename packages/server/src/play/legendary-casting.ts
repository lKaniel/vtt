import type { Player, Point } from '@vtt/shared';
import { legendaryProblem, spendLegendary, type Spell, SpellSchema } from '@vtt/system-dnd5e';
import type { LegendaryMessage } from '../actions/legendary-actions.ts';
import type { SpellActions } from '../actions/spell-actions.ts';
import { Refusal, requireGm, type Table } from './table.ts';

// A legendary action that is a save action (Wing Attack, Disrupt Life) runs
// like a breath weapon, out of the creature's turn: around it, at the
// creature the GM targets, or at the point where that creature stands.

type Legendary = Extract<LegendaryMessage, { t: 'legendary' }>;

/** Whether the legendary option is a save action run like a spell. */
export function isLegendarySpell(table: Table, msg: LegendaryMessage): msg is Legendary {
  if (msg.t !== 'legendary') return false;
  const token = table.store.tokens.get(msg.token);
  const sheet = token && table.sheetOf(token);
  return !!sheet?.legendary?.options.find((o) => o.id === msg.option)?.spell;
}

/** The point an area lands on: where the target stands, unless it spreads around the creature itself. */
function landing(table: Table, spell: Spell, target: string | undefined): Point | undefined {
  const at = target ? table.store.tokens.get(target) : undefined;
  return spell.area && spell.area.shape !== 'emanation' && at ? [at.x, at.y] : undefined;
}

export function castLegendary(
  { table, spells }: { table: Table; spells: SpellActions },
  player: Player,
  canSee: (id: string) => boolean,
  msg: Legendary,
): void {
  requireGm(player);
  const caster = table.fighter(msg.token);
  const problem = legendaryProblem(caster.token, caster.sheet, table.store.combat, msg.option);
  if (problem) throw new Refusal(problem);
  const option = caster.sheet.legendary!.options.find((o) => o.id === msg.option)!;
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
  const targets = spells.targets(caster, spell, aim, canSee);
  table.store.setToken(spendLegendary(caster.token, option.cost));
  table.note(`${caster.token.name} takes a legendary action, ${option.name}`);
  spells.strike(caster.token.id, { spell, slot: 0, point }, targets);
}
