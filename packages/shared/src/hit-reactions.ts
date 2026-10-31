import type { AttackRoll } from './attack.ts';
import type { Creature } from './creature.ts';
import { canAct } from './effects.ts';
import type { CastSide } from './spells.ts';
import type { WeaponAttackOutcome } from './weapon-attack.ts';

// Reactions a creature can take as an attack hits it: the shield spell
// (+5 AC, which may turn the hit into a miss) and uncanny dodge (half damage).

export type HitReaction = 'shield' | 'uncanny-dodge';

/** The lowest spell slot the creature could cast shield with, or undefined. */
export function shieldSlot(sheet: Pick<Creature, 'caster'>): number | undefined {
  const caster = sheet.caster;
  if (!caster?.spells.some((s) => s.id === 'shield')) return undefined;
  const index = caster.left.findIndex((n) => n > 0);
  return index < 0 ? undefined : index + 1;
}

/** The reactions `target` could take against this hit; shield only when it would make it miss. */
export function hitReactions(target: CastSide, roll: AttackRoll): HitReaction[] {
  const { sheet } = target;
  if (!roll.hit || sheet.hp <= 0 || !canAct(sheet)) return [];
  const out: HitReaction[] = [];
  if (!roll.crit && roll.total < sheet.ac + 5 && shieldSlot(sheet)) out.push('shield');
  if (sheet.features.some((f) => f.id === 'uncanny-dodge') && roll.damage.length) out.push('uncanny-dodge');
  return out;
}

/** The hit turned into a miss by shield: no damage and nothing that rides on a hit. */
export function shielded(outcome: WeaponAttackOutcome): WeaponAttackOutcome {
  return {
    ...outcome,
    roll: { ...outcome.roll, hit: false, damage: [] },
    sneak: false,
    smote: false,
    push: undefined,
    targetEffects: [],
    notes: ['shield'],
  };
}

/** The hit's damage halved by uncanny dodge. */
export function halved(outcome: WeaponAttackOutcome): WeaponAttackOutcome {
  const damage = outcome.roll.damage.map((d) => ({ ...d, roll: { ...d.roll, total: Math.floor(d.roll.total / 2) } }));
  return { ...outcome, roll: { ...outcome.roll, damage }, notes: [...outcome.notes, 'uncanny dodge'] };
}
