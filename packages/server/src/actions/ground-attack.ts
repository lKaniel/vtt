import { gridKind, type Point, roll } from '@vtt/shared';
import { type Attack, type AttackLog, attackRange, d20Formula, tokenDistance } from '@vtt/system-dnd5e';
import { type Cost, type Fighter, Refusal, type Table } from '../play/table.ts';

// An attack made at empty ground, as BG3 allows: a swing at the air or an
// arrow into the dirt. It costs what any attack costs, needs the point in
// reach and in sight, and hits nothing.

export interface GroundAttack {
  attacker: Fighter;
  attack: Attack;
  point: Point;
  cost: Cost;
}

/** Spends the attack at `point` and logs the roll at nothing; throws when the point is out of reach or sight. */
export function attackGround(
  table: Table,
  { attacker, attack, point, cost }: GroundAttack,
  log: (l: AttackLog) => void,
): void {
  const { world } = table.store;
  const from: Point = [attacker.token.x, attacker.token.y];
  const at = { x: point[0], y: point[1], size: 1 };
  const feet = tokenDistance(attacker.token, at, world.gridSize, gridKind(world));
  if (attackRange(attack, feet) === 'out') throw new Refusal(`That point is out of range (${feet} ft)`);
  if (!table.clearShot(from, point)) throw new Refusal(`${attacker.token.name} has no clear shot`);
  table.pay(attacker.token, cost, attacker.sheet.attacksPerAction);
  log({
    attacker: attacker.token.name,
    target: 'nothing',
    attackerId: attacker.token.id,
    targetId: '',
    kind: attack.kind === 'melee' ? 'melee' : 'ranged',
    attack: attack.name,
    d20: roll(d20Formula(attack.toHit, [], {}), table.rng),
    hit: false,
    crit: false,
    damage: 0,
    parts: [],
    notes: ['aimed at empty ground'],
  });
}
