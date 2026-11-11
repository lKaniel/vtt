import { roll, type Roll } from '@vtt/shared';
import { z } from 'zod';
import { ABILITIES, type Damage, type DamageType } from './stats-schema.ts';

// What the roller picks for one roll, as Foundry's roll dialog offers it:
// advantage or disadvantage on the d20, and a critical hit forced or held
// back on the damage. The pick joins whatever the effects already give, so
// an advantage picked against a poisoned creature's disadvantage still
// cancels out, as the rules say.

export const ROLL_EDGES = ['advantage', 'disadvantage'] as const;
export type RollEdge = (typeof ROLL_EDGES)[number];

/** `crit`: a hit deals critical damage; `normal`: it never does, even on a 20. */
export const CRIT_CHOICES = ['crit', 'normal'] as const;
export type CritChoice = (typeof CRIT_CHOICES)[number];

/** How the d20 is rolled when the roller says so outright (the roll dialog). */
export const D20_MODES = ['advantage', 'normal', 'disadvantage'] as const;
export type D20Mode = (typeof D20_MODES)[number];

/** A modifier typed into the roll dialog: numbers and plain dice, "+2", "1d4", "-1d4+1". */
const TERM = String.raw`(\d{0,2}d\d{1,3}|\d{1,3})`;
export const MODIFIER = new RegExp(`^[+-]?${TERM}([+-]${TERM}){0,5}$`);
const modifier = z.string().max(40).regex(MODIFIER);

/** What an action spends of the turn when the roller says so: an action, a bonus action, the reaction, or nothing. */
export const SPENDS = ['action', 'bonus', 'reaction', 'free'] as const;
export type Spend = (typeof SPENDS)[number];

// The roll dialog (session-roll-dialog.ts on the client) says more than the
// quick pick: `d20` is how the d20 is rolled whatever the effects give,
// `situational` joins the d20, `damageExtra` the first damage part, and
// `damageSet` is the damage of a hit, typed in, and `spend` is what the
// action costs of the turn instead of what it usually does.
export const RollChoiceSchema = z.object({
  edge: z.enum(ROLL_EDGES).optional(),
  crit: z.enum(CRIT_CHOICES).optional(),
  d20: z.enum(D20_MODES).optional(),
  situational: modifier.optional(),
  damageExtra: modifier.optional(),
  damageSet: z.number().int().min(0).max(9999).optional(),
  spend: z.enum(SPENDS).optional(),
});
export type RollChoice = z.infer<typeof RollChoiceSchema>;

interface Edged {
  advantage: boolean;
  disadvantage: boolean;
}

/** The effects' advantage and disadvantage with the roller's pick added. */
export function withEdge<T extends Edged>(mods: T, edge: RollEdge | undefined): T {
  if (!edge) return mods;
  return { ...mods, [edge]: true };
}

type Rolled = Edged & { bonus?: readonly string[] };

/** A typed modifier as a term of a formula: "+2" and "2" are "2", "-1d4" stays. */
const term = (modifier: string) => modifier.replace(/\s+/g, '').replace(/^\+/, '');
const signed = (modifier: string) => (term(modifier).startsWith('-') ? term(modifier) : `+${term(modifier)}`);

/**
 * What a d20 rolls with once the roller's whole pick is counted: `d20` is
 * final, else `edge` joins the effects'; a situational modifier joins the
 * bonus dice.
 */
export function withPick<T extends Rolled>(mods: T, pick: RollChoice | undefined): T {
  const edged = pick?.d20
    ? { ...mods, advantage: pick.d20 === 'advantage', disadvantage: pick.d20 === 'disadvantage' }
    : withEdge(mods, pick?.edge);
  if (!pick?.situational) return edged;
  return { ...edged, bonus: [...(mods.bonus ?? []), term(pick.situational)] };
}

/** Damage parts with the pick's extra damage joined to the first, so a minus takes off it. */
export function withDamageExtra(parts: readonly Damage[], pick: RollChoice | undefined): Damage[] {
  const [first, ...rest] = parts;
  if (!first || !pick?.damageExtra) return [...parts];
  return [{ ...first, dice: `${first.dice}${signed(pick.damageExtra)}` }, ...rest];
}

interface DamageRoll {
  roll: Roll;
  type: DamageType;
}

/** The damage rolled, or the number the roller set for it, as one part of the first part's type. */
export function setDamage<T extends DamageRoll>(rolls: T[], pick: RollChoice | undefined): (T | DamageRoll)[] {
  const [first] = rolls;
  if (!first || pick?.damageSet === undefined) return rolls;
  return [{ roll: roll(`${pick.damageSet}`), type: first.type }];
}

/** Whether a roll deals critical damage once the roller's pick is counted: only a hit can. */
export function chosenCrit(rolled: { hit: boolean; crit: boolean }, choice: CritChoice | undefined): boolean {
  if (!rolled.hit || choice === 'normal') return false;
  return choice === 'crit' || rolled.crit;
}

const EDGE_NOTES: Record<RollEdge, string> = { advantage: 'advantage picked', disadvantage: 'disadvantage picked' };
const CRIT_NOTES: Record<CritChoice, string> = { crit: 'critical hit picked', normal: 'no critical picked' };

const SPEND_NOTES: Record<Spend, string> = {
  action: 'as an action (picked)',
  bonus: 'as a bonus action (picked)',
  reaction: 'as a reaction (picked)',
  free: 'no action spent (picked)',
};

const D20_NOTES: Record<D20Mode, string> = {
  advantage: 'rolled with advantage (picked)',
  normal: 'rolled normally (picked)',
  disadvantage: 'rolled with disadvantage (picked)',
};

/** What the log says the roller picked, so the table sees it. */
export function pickNotes(pick: RollChoice | undefined): string[] {
  if (!pick) return [];
  return [
    pick.d20 ? D20_NOTES[pick.d20] : pick.edge && EDGE_NOTES[pick.edge],
    pick.crit && CRIT_NOTES[pick.crit],
    pick.situational && `situational ${signed(pick.situational)}`,
    pick.damageExtra && `extra damage ${signed(pick.damageExtra)}`,
    pick.damageSet !== undefined && `damage set to ${pick.damageSet}`,
    pick.spend && SPEND_NOTES[pick.spend],
  ].filter((n): n is string => !!n);
}

const ref = z.string().max(80);

/** A roll the dialog is about to offer, asked of the server for its default: how the d20 would be rolled as things stand. */
export const RollAskSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attack'), attacker: ref, target: ref, attack: z.string().max(120) }),
  z.object({ kind: z.literal('spell'), caster: ref, spell: ref, target: ref }),
  z.object({
    kind: z.literal('check'),
    token: ref,
    ability: z.enum(ABILITIES),
    skill: z.string().max(40).optional(),
    save: z.boolean().optional(),
    tool: z.string().max(40).optional(),
  }),
]);
export type RollAsk = z.infer<typeof RollAskSchema>;

/** Advantage and disadvantage as the one way the d20 is rolled: one of each cancels out. */
export function d20Mode({ advantage, disadvantage }: Edged): D20Mode {
  if (advantage === disadvantage) return 'normal';
  return advantage ? 'advantage' : 'disadvantage';
}
