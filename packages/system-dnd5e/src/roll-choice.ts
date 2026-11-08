import { z } from 'zod';

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

export const RollChoiceSchema = z.object({
  edge: z.enum(ROLL_EDGES).optional(),
  crit: z.enum(CRIT_CHOICES).optional(),
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

/** Whether a roll deals critical damage once the roller's pick is counted: only a hit can. */
export function chosenCrit(rolled: { hit: boolean; crit: boolean }, choice: CritChoice | undefined): boolean {
  if (!rolled.hit || choice === 'normal') return false;
  return choice === 'crit' || rolled.crit;
}

const EDGE_NOTES: Record<RollEdge, string> = { advantage: 'advantage picked', disadvantage: 'disadvantage picked' };
const CRIT_NOTES: Record<CritChoice, string> = { crit: 'critical hit picked', normal: 'no critical picked' };

/** What the log says the roller picked, so the table sees it. */
export function pickNotes(pick: RollChoice | undefined): string[] {
  return [pick?.edge && EDGE_NOTES[pick.edge], pick?.crit && CRIT_NOTES[pick.crit]].filter((n): n is string => !!n);
}
