import { canControl, type Player, roll } from '@vtt/shared';
import {
  type Actor,
  actorLevelPlan,
  classesText,
  characterLevel,
  levelDownActor,
  levelUpActor,
  type Token,
} from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { Refusal, type Table } from '../play/table.ts';

// Levelling up in the game (the sheet's Level up): a character that is only
// an actor (imported from Foundry, made on its sheet) takes its next level
// by the rules in system-dnd5e actor-level-up.ts. The owner or the GM may;
// the server rolls the hit die and tells the table. Characters made with
// the creator level up through their build (character-api.ts).

type LevelUp = Extract<ClientMessage, { t: 'levelUp' }>;
type LevelDown = Extract<ClientMessage, { t: 'levelDown' }>;

interface Target {
  sheet: Token;
  save: (stats: Token['stats']) => void;
}

export function levelUp(table: Table, player: Player, msg: LevelUp): void {
  const { sheet, save, stats } = characterOf(table, player, msg, 'levels up as a monster does: on its sheet');
  const content = table.content(sheet);
  const plan = actorLevelPlan(stats, msg.class, content, content.edition);
  const hp: number | 'average' = msg.hp === 'roll' ? roll(`1d${plan.hitDie}`, table.rng).total : 'average';
  ruled(() => {
    const choice = { class: msg.class, hp, subclass: msg.subclass, improvement: msg.improvement };
    const next = levelUpActor(stats, choice, content, content.edition);
    save(next);
    const rolled = typeof hp === 'number' ? `, rolling ${hp} on a d${plan.hitDie} for hit points` : '';
    table.note(`${sheet.name} reaches level ${characterLevel(next)} (${classesText(next)})${rolled}`);
  });
}

/** Takes a level back (the owner or the GM): the class level and its average hit points. */
export function levelDown(table: Table, player: Player, msg: LevelDown): void {
  const { sheet, save, stats } = characterOf(table, player, msg, 'has no class levels to take back');
  ruled(() => {
    const lower = levelDownActor(stats, msg.class, table.content(sheet));
    save(lower);
    table.note(`${sheet.name} goes back to level ${characterLevel(lower)} (${classesText(lower)})`);
  });
}

/** The character `msg` names, when `player` may change it and it has class levels; else why not. */
function characterOf(table: Table, player: Player, msg: LevelUp | LevelDown, monster: string) {
  const { sheet, save } = targetOf(table, msg);
  if (!canControl(sheet, player)) throw new Refusal('No such creature');
  if (sheet.monster || !sheet.stats) throw new Refusal(`${sheet.name} ${monster}`);
  return { sheet, save, stats: sheet.stats };
}

/** Runs `fn`, turning a rule's Error into a Refusal the player is told. */
function ruled(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    if (e instanceof Error && !(e instanceof Refusal)) throw new Refusal(e.message);
    throw e;
  }
}

function targetOf(table: Table, msg: LevelUp | LevelDown): Target {
  const store = table.store;
  if (msg.token) {
    const token = store.tokens.get(msg.token);
    if (!token) throw new Refusal('No such creature');
    return { sheet: token, save: (stats) => store.setToken({ ...token, stats }) };
  }
  const actor = msg.actor ? store.actors.get(msg.actor) : undefined;
  if (!actor) throw new Refusal('No such creature');
  return { sheet: asToken(actor), save: (stats) => store.setActor({ ...actor, stats }) };
}

const asToken = (actor: Actor): Token => ({ ...actor, x: 0, y: 0 });
