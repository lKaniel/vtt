import { canControl, gridKind } from '@vtt/shared';
import {
  attackModifiers,
  attackRange,
  checkEdge,
  d20Mode,
  type RollAsk,
  tokenDistance,
  weaponAttackEdge,
} from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import type { Sender } from './game-routes.ts';
import { flanked } from '../play/flanking.ts';
import { type Fighter, Refusal, type Table } from '../play/table.ts';

// The roll dialog's question before a roll (session-roll-dialog.ts on the
// client): how would this d20 be rolled as things stand? Advantage,
// disadvantage or neither, from the same rules the roll itself uses, so
// the dialog shows the default and the player changes it knowingly.

interface Edge {
  advantage: boolean;
  disadvantage: boolean;
}

const NONE: Edge = { advantage: false, disadvantage: false };

/** The creature rolling: one the sender controls. */
function roller(table: Table, from: Sender, id: string): Fighter {
  const fighter = table.fighter(id);
  if (!canControl(fighter.token, from.player)) throw new Refusal('No such token');
  return fighter;
}

/** The creature rolled against: one the sender sees. */
function foe(table: Table, from: Sender, id: string): Fighter {
  if (!from.canSee(id)) throw new Refusal('No such target');
  return table.fighter(id);
}

function attackEdge(table: Table, from: Sender, ask: Extract<RollAsk, { kind: 'attack' }>): Edge {
  const attacker = roller(table, from, ask.attacker);
  const target = foe(table, from, ask.target);
  const attack = attacker.sheet.attacks.find((a) => a.name === ask.attack);
  if (!attack) return NONE;
  const { world } = table.store;
  const [gridSize, grid] = [world.gridSize, gridKind(world)];
  const reach = attackRange(attack, tokenDistance(attacker.token, target.token, gridSize, grid));
  const range = reach === 'out' ? 'normal' : reach;
  const flanking = flanked(table, attacker.token, target.token);
  return weaponAttackEdge({ attacker, target, attack, range, flanked: flanking, gridSize, grid });
}

function spellEdge(table: Table, from: Sender, ask: Extract<RollAsk, { kind: 'spell' }>): Edge {
  const caster = roller(table, from, ask.caster);
  const target = foe(table, from, ask.target);
  const { world } = table.store;
  const feet = tokenDistance(caster.token, target.token, world.gridSize, gridKind(world));
  return attackModifiers(caster, target, { within5: feet <= 5 });
}

function edgeOf(table: Table, from: Sender, ask: RollAsk): Edge {
  if (ask.kind === 'attack') return attackEdge(table, from, ask);
  if (ask.kind === 'spell') return spellEdge(table, from, ask);
  return checkEdge(roller(table, from, ask.token).sheet, ask);
}

/** Answers the sender alone with how the roll's d20 would be rolled now. */
export function rollDefaults(table: Table, from: Sender, msg: Extract<ClientMessage, { t: 'rollDefaults' }>): void {
  from.reply({ t: 'rollDefaults', ref: msg.ref, d20: d20Mode(edgeOf(table, from, msg.roll)) });
}
