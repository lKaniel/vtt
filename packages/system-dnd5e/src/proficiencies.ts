import type { Character, Parts } from './character.ts';
import { choiceNoun, expandFrom } from './proficiency-catalog.ts';
import type { Grants } from './proficiency-grants.ts';

export * from './proficiency-catalog.ts';
export * from './proficiency-grants.ts';
export * from './training.ts';

// A character's armor, weapons, tools and languages: what its class,
// species, background and the edition give, the picks they offer (kept in
// `proficiencyPicks` by "<source>:<choice>"), and custom ones on top.

interface Source {
  /** "class", "species", "background", "base" or "multiclass-<class>". */
  key: string;
  /** Shown with its choices: "Acolyte", "Dwarf". */
  name: string;
  grants: Grants;
}

function sources(c: Character, p: Parts): Source[] {
  const classes = p.book.content.classes;
  const out: (Source | undefined)[] = [
    p.book.origins.base && { key: 'base', name: '', grants: p.book.origins.base },
    p.species?.proficiencies && { key: 'species', name: p.species.name, grants: p.species.proficiencies },
    p.subspecies?.proficiencies && { key: 'subspecies', name: p.subspecies.name, grants: p.subspecies.proficiencies },
    p.background?.proficiencies && { key: 'background', name: p.background.name, grants: p.background.proficiencies },
    p.cls?.proficiencies && { key: 'class', name: p.cls.name, grants: p.cls.proficiencies },
    ...c.multiclass.map(({ class: id }) => {
      const cls = classes.get(id);
      const grants = cls?.proficiencies?.multiclass;
      return cls && grants ? { key: `multiclass-${id}`, name: cls.name, grants } : undefined;
    }),
  ];
  return out.filter((s): s is Source => !!s);
}

/** A pick the character makes: `pick` of `options`. */
export interface ProficiencyChoice {
  /** Where the picks are kept in `proficiencyPicks`. */
  key: string;
  /** What offers it ("Acolyte"); empty for what every character gets. */
  source: string;
  pick: number;
  options: string[];
  /** The options picked, in the order picked. */
  picked: string[];
}

const fixedOf = (list: readonly Source[]) => new Set(list.flatMap((s) => s.grants.fixed));

/** Every pick the character's class, species and background offer; another pick's choices aren't offered again. */
export function proficiencyChoices(c: Character, p: Parts): ProficiencyChoice[] {
  const list = sources(c, p);
  const fixed = fixedOf(list);
  const raw = list.flatMap((s) =>
    s.grants.choices.map((ch) => ({
      key: `${s.key}:${ch.id}`,
      source: s.name,
      pick: ch.pick,
      all: expandFrom(ch.from, c.rules).filter((id) => !fixed.has(id)),
    })),
  );
  const pickedIn = (key: string, all: string[]) => (c.proficiencyPicks[key] ?? []).filter((id) => all.includes(id));
  return raw.map(({ all, ...ch }) => {
    const elsewhere = new Set(raw.filter((o) => o.key !== ch.key).flatMap((o) => pickedIn(o.key, o.all)));
    const options = all.filter((id) => !elsewhere.has(id));
    return { ...ch, options, picked: [...new Set(pickedIn(ch.key, options))] };
  });
}

/** The character's proficiencies: what it's given, what it picked, then its custom ones. */
export function characterProficiencies(c: Character, p: Parts): string[] {
  const picked = proficiencyChoices(c, p).flatMap((ch) => ch.picked.slice(0, ch.pick));
  return [...new Set([...fixedOf(sources(c, p)), ...picked, ...c.proficiencies])];
}

/** The proficiencies given with no choice, for the creator to show as given. */
export function givenProficiencies(c: Character, p: Parts): string[] {
  return [...fixedOf(sources(c, p))];
}

/** "Choose 2 languages (Acolyte)." for each pick not made in full. */
export function proficiencyIssues(c: Character, p: Parts): string[] {
  return proficiencyChoices(c, p)
    .filter((ch) => ch.picked.length !== ch.pick && ch.options.length >= ch.pick)
    .map((ch) => {
      const from = ch.source ? ` (${ch.source})` : '';
      return `Choose ${ch.pick} ${choiceNoun(ch.options, ch.pick)}${from}.`;
    });
}

/** Toggles `id` in a choice's picks, keeping no more than it allows. */
export function toggleProficiencyPick(c: Character, choice: ProficiencyChoice, id: string): Character {
  const now = choice.picked;
  const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(-choice.pick);
  return { ...c, proficiencyPicks: { ...c.proficiencyPicks, [choice.key]: next } };
}
