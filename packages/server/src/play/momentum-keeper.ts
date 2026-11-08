import {
  type Attack,
  bleedTick,
  type Damage,
  type Effect,
  finisherDamage,
  finisherOnHit,
  finisherProblem,
  freshMomentum,
  gainMomentum,
  keepMomentum,
  regainFocus,
  regainOnInitiative,
  regainOnNat20,
  spendMomentum,
  type Token,
  tokenDistance,
  type WeaponAttackOutcome,
} from '@vtt/system-dnd5e';
import { gridKind, isParty } from '@vtt/shared';
import { addEffects } from '../actions/attack-outcome.ts';
import { Refusal, type Fighter, type Table } from './table.ts';

// A jaeger's focus and momentum in a fight (momentum.ts, finishers.ts in the
// system): dice kept fresh by attacking, spent by a finisher riding on a
// hit, gained by Lethal Tempo; points back on a natural 20 and on
// initiative; dice that fade at the end of a turn away from foes; bleeds.

/** The extra damage of the hit finisher an attack is readied with; refuses one the attacker can't use. */
export function readiedFinisher(attacker: Fighter, attack: Attack, finisher: string | undefined): Damage | undefined {
  if (!finisher) return undefined;
  const problem = finisherProblem(attacker.sheet, finisher);
  if (problem) throw new Refusal(`${attacker.token.name} ${problem}`);
  return finisherDamage(attacker.sheet, attack, finisher);
}

interface Struck {
  attacker: Fighter;
  target: Fighter;
  outcome: WeaponAttackOutcome;
  finisher?: string;
  /** It is the attacker's own turn (Lethal Tempo counts the first hit of it). */
  onTurn: boolean;
}

const foes = (a: Token, b: Token) => isParty(a) !== isParty(b);

/** After an attack lands: dice kept fresh, a finisher spent, points back, Lethal Tempo's dice. */
export function afterAttack(table: Table, struck: Struck): void {
  const { attacker, target, outcome } = struck;
  let token = table.store.tokens.get(attacker.token.id);
  if (!token) return;
  token = freshMomentum(token);
  if (outcome.roll.natural === 20 && foes(attacker.token, target.token)) token = regainOnNat20(token, attacker.sheet);
  const downed = (table.sheetOf(table.store.tokens.get(target.token.id) ?? target.token)?.hp ?? 1) <= 0;
  if (outcome.roll.hit && struck.finisher) token = finish(table, token, { ...struck, downed });
  if (outcome.roll.hit) token = tempo(table, token, { ...struck, downed });
  table.store.setToken(token);
}

/** The readied finisher once its hit landed: its effects, its point back, every die spent. */
function finish(table: Table, token: Token, struck: Struck & { downed: boolean }): Token {
  const feature = struck.attacker.sheet.features.find((f) => f.id === struck.finisher);
  if (!feature) return token;
  const out = finisherOnHit(
    { attacker: struck.attacker, target: struck.target, feature, downed: struck.downed },
    table.rng,
  );
  addEffects(table, struck.target.token.id, { targetEffects: out.effects });
  for (const note of out.notes) table.note(note);
  table.note(`${token.name} uses ${feature.name}`);
  return spendMomentum(regainFocus(token, struck.attacker.sheet, out.regain));
}

/** Lethal Tempo: dice for the first hit on the attacker's turn and for each creature it drops. */
function tempo(table: Table, token: Token, struck: Struck & { downed: boolean }): Token {
  const on = struck.attacker.sheet.features.find((f) => f.momentumOn)?.momentumOn;
  if (!on) return token;
  const left = struck.onTurn ? table.budget(token) : undefined;
  const first = left && !left.used.includes('first-hit') ? (on.firstHit ?? 0) : 0;
  if (left && first) table.setBudget(token, { ...left, used: [...left.used, 'first-hit'] });
  const kill = struck.downed ? (on.kill ?? 0) : 0;
  return gainMomentum(token, struck.attacker.sheet, first + kill);
}

/** Initiative rolled: an empty focus pool gets a point back. */
export function rollInitiative(table: Table, fighters: readonly Fighter[]): void {
  for (const { token, sheet } of fighters) {
    const now = table.store.tokens.get(token.id);
    const after = now && regainOnInitiative(now, sheet);
    if (after && after !== now) table.store.setToken(after);
  }
}

/** The end of a creature's turn: its momentum fades unless kept fresh or it stands by a foe; its bleeds run. */
export function turnEnds(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  if (!token) return;
  if (token.momentum) table.store.setToken(keepMomentum(token, nearFoe(table, token)));
  bleed(table, id);
}

function nearFoe(table: Table, token: Token): boolean {
  const { world } = table.store;
  return [...table.store.tokens.values()].some(
    (t) =>
      t.id !== token.id &&
      foes(t, token) &&
      (table.sheetOf(t)?.hp ?? 0) > 0 &&
      tokenDistance(t, token, world.gridSize, gridKind(world)) <= 5,
  );
}

/** Bleeding wounds: hit points lost, a die fewer next time, a save to stop. */
function bleed(table: Table, id: string): void {
  const wounds = table.store.tokens.get(id)?.effects?.filter((e) => e.bleed) ?? [];
  for (const wound of wounds) bleedOnce(table, id, wound);
}

function bleedOnce(table: Table, id: string, wound: Effect): void {
  const token = table.store.tokens.get(id);
  const sheet = token && table.sheetOf(token);
  if (!token || !sheet || sheet.hp <= 0) return;
  const tick = bleedTick(wound, sheet, table.rng);
  const others = (token.effects ?? []).filter((e) => e.id !== wound.id);
  table.store.setToken({ ...token, effects: tick.effect ? [...others, tick.effect] : others });
  table.hurt(table.store.tokens.get(id)!, { hp: sheet.hp - tick.lost, tempHp: sheet.tempHp }, tick.lost);
  table.note(`${token.name} bleeds for ${tick.lost}${tick.effect ? '' : ', and the bleeding stops'}`);
}
