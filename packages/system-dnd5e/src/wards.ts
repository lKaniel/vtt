import { type Rng, roll } from '@vtt/shared';
import type { AttackRoll } from './attack.ts';
import { abilityMod } from './creature-math.ts';
import type { Creature } from './creature.ts';
import { type Affected, rollSave, type SaveRoll } from './effects.ts';
import type { Token } from './token-schema.ts';
import type { Attack } from './stats-schema.ts';

// What stands between an attacker and its target: mirror image's duplicates,
// sanctuary's save, and ray of enfeeblement's weakened blows.

/** The Wisdom save an attacker makes to target a creature under sanctuary; undefined when there is none. */
export function sanctuarySave(attacker: Affected, target: Affected, rng: Rng = Math.random): SaveRoll | undefined {
  const dc = target.effects.find((e) => typeof e.sanctuary === 'number')?.sanctuary;
  return typeof dc === 'number' ? rollSave(attacker, 'wis', dc, rng) : undefined;
}

/** The token with its sanctuary ended (it attacked); undefined when it had none. */
export function withoutSanctuary(token: Token): Token | undefined {
  const effects = token.effects ?? [];
  if (!effects.some((e) => e.sanctuary !== undefined)) return undefined;
  return { ...token, effects: effects.filter((e) => e.sanctuary === undefined) };
}

/**
 * The token as banishment leaves it: hidden while an effect sends it away,
 * shown again once none does. A token the GM had hidden already stays hidden.
 * Undefined when nothing changes.
 */
export function withBanishment(token: Token): Token | undefined {
  const away = (token.effects ?? []).some((e) => e.banished);
  if (away && !token.banished && !token.hidden) return { ...token, hidden: true, banished: true };
  if (!away && token.banished) return { ...token, hidden: false, banished: undefined };
  return undefined;
}

/** Blink at the end of its bearer's turn: on 11 or more it vanishes until its next turn starts. */
export function blinkAway(token: Token, rng: Rng = Math.random): Token {
  const effects = token.effects ?? [];
  if (!effects.some((e) => e.blink) || roll('1d20', rng).total < 11) return token;
  const away = { id: `blinked-${token.id}`, name: 'Blinked away', source: token.id, rounds: 1, banished: true };
  return { ...token, effects: [...effects.filter((e) => e.id !== away.id), away] };
}

/** Duplicates thresholds on the d20 by how many are left (2014). */
const TO_TURN = [21, 11, 8, 6];

/** An attacker that doesn't rely on sight isn't fooled by duplicates. */
function seesThrough(attacker: Creature): boolean {
  if (attacker.conditions.includes('blinded')) return true;
  return (attacker.senses?.blindsight ?? 0) > 0 || (attacker.senses?.truesight ?? 0) > 0;
}

/**
 * Whether an attack lands on one of the target's mirror images: "hit" destroys
 * one, "missed" was turned on one and missed it. 2014 turns the attack on a d20
 * by how many are left (the duplicate's AC is 10 + Dex); 2024 moves a hit onto
 * one when any d6 rolled for them shows 3 or more.
 */
export function mirrorImage(
  attacker: Creature,
  target: Creature,
  attack: AttackRoll,
  rng: Rng,
): 'hit' | 'missed' | undefined {
  const left = target.effects.find((e) => e.images)?.images ?? 0;
  if (!left || seesThrough(attacker)) return undefined;
  if (target.edition === '2024') {
    if (!attack.hit) return undefined;
    const faces = Array.from({ length: left }, () => roll('1d6', rng).total);
    return faces.some((f) => f >= 3) ? 'hit' : undefined;
  }
  if (roll('1d20', rng).total < TO_TURN[left]!) return undefined;
  const ac = 10 + abilityMod(target.abilities.dex);
  return attack.natural === 20 || (attack.natural !== 1 && attack.total >= ac) ? 'hit' : 'missed';
}

/** The token with one mirror image fewer; the spell ends with the last. */
export function lessImages(token: Token): Token {
  const effects = (token.effects ?? []).flatMap((e) => {
    if (!e.images) return [e];
    return e.images > 1 ? [{ ...e, images: e.images - 1 }] : [];
  });
  return { ...token, effects };
}

/** Damage rolls after the attacker's weakened blows: halved with a Strength weapon (2014), or dice taken off (2024). */
export function weakenedDamage(
  attacker: Affected,
  attack: Attack,
  damage: AttackRoll['damage'],
  rng: Rng,
): AttackRoll['damage'] {
  const weak = attacker.effects.find((e) => e.weakened)?.weakened;
  if (!weak || !damage.length) return damage;
  if (weak === 'half') {
    const usesStr = attack.weapon ? attack.weapon.ability === 'str' : attack.kind === 'melee';
    if (!usesStr) return damage;
    return damage.map((d) => ({ ...d, roll: { ...d.roll, total: Math.floor(d.roll.total / 2) } }));
  }
  const [first, ...rest] = damage;
  const less = Math.max(0, first!.roll.total - roll(weak, rng).total);
  return [{ ...first!, roll: { ...first!.roll, total: less } }, ...rest];
}
