import {
  animationRef,
  applyDamage,
  type AttackLog,
  retaliation,
  type Token,
  tokenDistance,
  type WeaponAttackOutcome,
} from '@vtt/system-dnd5e';
import { gridKind } from '@vtt/shared';
import type { Fighter, Table } from '../play/table.ts';

// A weapon attack landing: its damage dealt, what rides on it (fire shield
// burning back, a push, effects on the target), and the attack's log line.

interface Landed {
  attacker: Fighter;
  target: Fighter;
  outcome: WeaponAttackOutcome;
}

/** Deals a landed attack's damage and logs it; returns the damage dealt. */
export function applyOutcome(
  table: Table,
  logAttack: (log: AttackLog) => void,
  { attacker, target, outcome }: Landed,
  { range, name, kind }: { range: string; name: string; kind: AttackLog['kind'] },
): number {
  const { roll: result } = outcome;
  const notes0: string[] = [];
  const parts = result.damage.map((d) => ({ amount: d.roll.total, type: d.type }));
  if (outcome.graze) parts.push(outcome.graze);
  const fresh = table.fighter(target.token.id);
  const { dealt, hp, tempHp, warded } = applyDamage(fresh.sheet, parts, table.rng);
  const total = dealt.reduce((sum, d) => sum + d, 0);
  if (total > 0) table.hurt(fresh.token, { hp, tempHp, crit: result.crit, warded }, total);
  if (result.hit && kind === 'melee') notes0.push(...hitBack(table, attacker.token, fresh));
  addEffects(table, target.token.id, outcome);
  const notes = [...outcome.notes, ...notes0];
  if (range === 'long') notes.push('long range: disadvantage');
  if (outcome.graze) notes.push(`graze: ${dealt.at(-1)} damage`);
  if (total > 0 && hp <= 0) notes.push(`${target.token.name} is down`);
  notes.push(...push(table, attacker.token, target.token, outcome.push));
  logAttack({
    attacker: attacker.token.name,
    target: target.token.name,
    attackerId: attacker.token.id,
    targetId: target.token.id,
    kind,
    attack: name,
    d20: result.d20,
    hit: result.hit,
    crit: result.crit,
    damage: total,
    parts: result.damage.map((d, i) => ({ ...d, dealt: dealt[i]! })),
    notes,
    animation: attacker.token.animations?.[animationRef('attack', name)],
  });
  return total;
}

/** Feet between two creatures, as the scene measures them. */
function distance(table: Table, a: Token, b: Token): number {
  const { world } = table.store;
  return tokenDistance(a, b, world.gridSize, gridKind(world));
}

/** A melee hit on a creature with fire shield burns the attacker standing within 5 ft. */
function hitBack(table: Table, attacker: Token, target: Fighter): string[] {
  const parts = retaliation(target.sheet.effects, table.rng);
  const struck = table.fighter(attacker.id);
  if (!parts.length || distance(table, attacker, target.token) > 5) return [];
  const { dealt, hp, tempHp, warded } = applyDamage(struck.sheet, parts, table.rng);
  const total = dealt.reduce((n, d) => n + d, 0);
  if (total > 0) table.hurt(struck.token, { hp, tempHp, warded }, total);
  return [`${attacker.name} takes ${total} damage back`];
}

/** The push mastery shoves the target straight away from the attacker. */
function push(table: Table, attacker: Token, target: Token, feet: number | undefined): string[] {
  if (!feet) return [];
  const moved = table.forceMove(target.id, [attacker.x, attacker.y], feet);
  return moved > 0 ? [`${target.name} is pushed ${moved} ft`] : [];
}

/** Effects the attack leaves on its target (masteries, finishers). */
export function addEffects(table: Table, id: string, outcome: Pick<WeaponAttackOutcome, 'targetEffects'>): void {
  if (!outcome.targetEffects.length) return;
  const token = table.store.tokens.get(id);
  if (!token) return;
  const ids = new Set(outcome.targetEffects.map((e) => e.id));
  const effects = [...(token.effects ?? []).filter((e) => !ids.has(e.id)), ...outcome.targetEffects];
  table.store.setToken({ ...token, effects });
}
