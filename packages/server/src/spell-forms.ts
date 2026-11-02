import { formProblem, type Spell, spellWithForm, withForm } from '@vtt/system-dnd5e';
import { Refusal, type Fighter, type Table } from './table.ts';

// Shape-shifting spells on the server (forms.ts in system-dnd5e has the
// rules): the form the caster picked is checked against every target, and
// after each step creatures change shape and back as their effects say.

/** The spell with the form the caster picked, checked against every target; other spells as they are. */
export function shaped(
  table: Table,
  caster: Fighter,
  spell: Spell,
  { form, targets }: { form: string | undefined; targets: readonly Fighter[] },
): Spell {
  if (!spell.transform) return spell;
  const content = table.content(caster.token);
  const monster = form ? content.monsters.get(form) : undefined;
  const casterLevel = caster.sheet.caster?.level ?? 1;
  for (const t of targets) {
    const problem = formProblem(spell, monster, { target: t.token, casterLevel, content });
    if (problem) throw new Refusal(`${caster.token.name} ${problem}`);
  }
  return monster ? spellWithForm(spell, monster.id) : spell;
}

/** Creatures change shape, and back, as their effects say (withForm). */
export function changeShapes(table: Table): void {
  for (const token of [...table.store.tokens.values()]) {
    const hp = (m: string) => table.content(token).monsters.get(m)?.hp ?? 1;
    const next = withForm(token, hp);
    if (next) table.store.setToken(next);
  }
}
