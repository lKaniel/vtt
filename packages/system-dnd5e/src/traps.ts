import { type Rng, roll } from '@vtt/shared';
import { z } from 'zod';
import { applyDamage } from './attack.ts';
import { type Affected, rollSave, type SaveRoll } from './effects.ts';
import { ABILITIES, type DamageType, DamageTypeSchema } from './stats-schema.ts';

// D&D traps: what a region's trap behaviour (its `system` field) means in
// these rules. A save against a DC, damage of a type, half on a save.

export const TrapRulesSchema = z.object({
  save: z.enum(ABILITIES).optional(),
  dc: z.number().int().min(1).max(40).optional(),
  /** Dice, e.g. "2d6"; none: the trap only calls for the save. */
  damage: z.string().min(1).optional(),
  type: DamageTypeSchema.optional(),
  /** A creature that makes the save takes half. */
  half: z.boolean().optional(),
});
export type TrapRules = z.infer<typeof TrapRulesSchema>;

type Victim = Affected & {
  hp: number;
  tempHp: number;
  resistances: readonly DamageType[];
  immunities: readonly DamageType[];
  vulnerabilities: readonly DamageType[];
};

export interface Sprung {
  save?: SaveRoll;
  /** Damage dealt, after resistances. */
  damage: number;
  hp: number;
  tempHp: number;
  /** What happened, for chat. */
  text: string;
}

function saveText(save: SaveRoll | undefined): string | undefined {
  if (!save) return undefined;
  return `${save.ability.toUpperCase()} save ${save.total} vs DC ${save.dc}: ${save.success ? 'made it' : 'failed'}`;
}

/** Damage after the save: all of it on a failure, half or none on a success. */
function afterSave(rolled: number, save: SaveRoll | undefined, rules: TrapRules): number {
  if (!save?.success) return rolled;
  return rules.half ? Math.floor(rolled / 2) : 0;
}

/** Springs a trap on a creature: its save (`saveRng`), then the damage (`diceRng`). */
export function springTrap(victim: Victim, rules: TrapRules, diceRng: Rng, saveRng: Rng): Sprung {
  const save = rules.save ? rollSave(victim, rules.save, rules.dc ?? 10, saveRng) : undefined;
  const type = rules.type ?? 'bludgeoning';
  const rolled = rules.damage ? roll(rules.damage, diceRng).total : 0;
  const after = applyDamage(
    {
      ...victim,
      resistances: [...victim.resistances],
      immunities: [...victim.immunities],
      vulnerabilities: [...victim.vulnerabilities],
    },
    [{ amount: afterSave(rolled, save, rules), type }],
  );
  const damage = after.dealt[0] ?? 0;
  const hurt = rules.damage && (damage > 0 || !save?.success) ? `${damage} ${type} damage` : undefined;
  const text = [saveText(save), hurt].filter(Boolean).join(', ');
  return { ...(save && { save }), damage, hp: after.hp, tempHp: after.tempHp, text };
}
