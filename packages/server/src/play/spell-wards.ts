import { lessImages, sanctuarySave, type Spell, withoutSanctuary } from '@vtt/system-dnd5e';
import { Refusal, type Fighter, type Table } from './table.ts';

// Sanctuary and mirror image as the server applies them (wards.ts in
// system-dnd5e has the rules): an attacker saves before it may go after a
// warded creature, and a duplicate hit in its place vanishes.

/** The attacker's budget on its own turn; none out of turn (a reaction) or outside a fight. */
function turnBudget(table: Table, attacker: Fighter): ReturnType<Table['budget']> {
  try {
    return table.budget(attacker.token);
  } catch (e) {
    if (e instanceof Refusal) return undefined;
    throw e;
  }
}

/**
 * An attacker going after a creature under sanctuary makes its Wisdom save
 * first; a failure means it has to pick another target. In a fight the
 * failure holds for the rest of its turn, so it can't keep trying.
 */
export function passSanctuary(table: Table, attacker: Fighter, target: Fighter): void {
  if (attacker.token.id === target.token.id) return;
  const mark = `sanctuary:${target.token.id}`;
  const left = turnBudget(table, attacker);
  const refuse = () =>
    new Refusal(
      `${attacker.token.name} can’t bring itself to attack ${target.token.name} (Sanctuary): choose another target`,
    );
  if (left?.used.includes(mark)) throw refuse();
  const save = sanctuarySave(attacker.sheet, target.sheet, table.rng);
  if (!save || save.success) return;
  if (left) table.setBudget(attacker.token, { ...left, used: [...left.used, mark] });
  throw refuse();
}

/** A spell aimed at creatures that would harm them; areas aren't stopped by sanctuary. */
function harmful(spell: Spell): boolean {
  return !spell.area && (!!spell.attack || !!spell.save || spell.damage.length > 0);
}

/** Every creature a harmful spell is aimed at gets its sanctuary save from the caster first. */
export function passSanctuaries(table: Table, caster: Fighter, spell: Spell, targets: readonly Fighter[]): void {
  if (!harmful(spell)) return;
  for (const target of targets) passSanctuary(table, caster, target);
}

/** The warded creature attacked or cast a spell at a foe: its sanctuary ends. */
export function breakSanctuary(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  const next = token && withoutSanctuary(token);
  if (next) table.store.setToken(next);
}

/** Casting ends the caster's sanctuary: a harmful spell at someone else (2014), or any spell (2024). */
export function castBreaksSanctuary(table: Table, caster: Fighter, spell: Spell, targets: readonly Fighter[]): void {
  const atOthers = harmful(spell) && targets.some((t) => t.token.id !== caster.token.id);
  if (atOthers || caster.sheet.edition === '2024') breakSanctuary(table, caster.token.id);
}

/** A mirror image was hit in the creature's place and vanishes. */
export function loseImage(table: Table, id: string): void {
  const token = table.store.tokens.get(id);
  if (token) table.store.setToken(lessImages(token));
}
