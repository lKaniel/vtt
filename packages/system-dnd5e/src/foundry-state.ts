import { at, list, type Loose, num, obj, opt } from './foundry-data.ts';
import { COINS } from './stats-schema.ts';
import type { Actor } from './token-schema.ts';

// Where a Foundry dnd5e creature stands between sessions: its coins, the
// slots and hit dice it has spent, exhaustion and death saves.

type State = Partial<Pick<Actor, 'currency' | 'exhaustion' | 'deathSaves' | 'spent'>>;

const count = (x: unknown, max = Infinity) => Math.min(max, Math.max(0, Math.round(num(x) ?? 0)));

function currencyOf(sys: Loose): State {
  const coins = obj(sys.currency);
  const held = Object.fromEntries(COINS.flatMap((c) => (count(coins[c]) ? [[c, count(coins[c])]] : [])));
  return opt('currency', Object.keys(held).length > 0 && held);
}

function deathOf(sys: Loose): State {
  const [successes, failures] = [
    count(at(sys, 'attributes.death.success'), 3),
    count(at(sys, 'attributes.death.failure'), 3),
  ];
  return opt('deathSaves', (successes > 0 || failures > 0) && { successes, failures });
}

/** Slots used per level: what Foundry has left (`value`) below its `max`. */
function slotsOf(sys: Loose): number[] {
  const spells = obj(sys.spells);
  const used = Array.from({ length: 9 }, (_, i) => {
    const slot = obj(spells[`spell${i + 1}`]);
    return Math.max(0, count(slot.max) - count(slot.value));
  });
  while (used.length && !used[used.length - 1]) used.pop();
  return used;
}

/** Hit dice spent: dnd5e 4+ keeps them on each class as `hd.spent`, older versions as `hitDiceUsed`. */
const hitDiceOf = (items: Loose[]) =>
  items
    .filter((i) => i.type === 'class')
    .reduce((n, i) => n + count(at(i, 'system.hd.spent') ?? at(i, 'system.hitDiceUsed')), 0);

function spentOf(sys: Loose, items: Loose[]): State {
  const slots = slotsOf(sys);
  const hitDice = hitDiceOf(items);
  const spent = { ...opt('slots', slots.length > 0 && slots), ...opt('hitDice', hitDice > 0 && hitDice) };
  return opt('spent', Object.keys(spent).length > 0 && spent);
}

/** The state of a Foundry actor (`system` and its items) that our sheet keeps. */
export function stateOf(sys: Loose, items: unknown): State {
  const exhaustion = count(at(sys, 'attributes.exhaustion'), 6);
  return {
    ...currencyOf(sys),
    ...opt('exhaustion', exhaustion > 0 && exhaustion),
    ...deathOf(sys),
    ...spentOf(sys, list(items).map(obj)),
  };
}
