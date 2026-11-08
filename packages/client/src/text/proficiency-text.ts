import {
  type Ability,
  type Content,
  proficiencyKind,
  type ProficiencyKind,
  proficiencyName,
  proficiencyOptions,
  toProficiency,
  TOOLS,
} from '@vtt/system-dnd5e';

// Armor, weapons, tools and languages as the sheet and the creator show
// them: grouped by kind, named, tools with the ability their checks use.

export type ProficiencyGroupKind = ProficiencyKind | 'other';

export interface ProficiencyItem {
  id: string;
  name: string;
  /** A tool's check ability. */
  ability?: Ability;
}

export interface ProficiencyGroup {
  kind: ProficiencyGroupKind;
  items: ProficiencyItem[];
}

const ORDER: ProficiencyGroupKind[] = ['armor', 'weapon', 'tool', 'language', 'other'];

function itemOf(id: string, content: Pick<Content, 'items'>): ProficiencyItem {
  const tool = TOOLS[id];
  return { id, name: proficiencyName(id, content), ...(tool && { ability: tool.ability }) };
}

function grouped(items: { kind: ProficiencyGroupKind; item: ProficiencyItem }[]): ProficiencyGroup[] {
  return ORDER.map((kind) => ({ kind, items: items.filter((i) => i.kind === kind).map((i) => i.item) })).filter(
    (g) => g.items.length > 0,
  );
}

/** A creature's proficiencies by kind; words that name none come last, as written. */
export function groupProficiencies(list: readonly string[], content: Pick<Content, 'items'>): ProficiencyGroup[] {
  const ids = [...new Set(list.map((p) => toProficiency(p, content)))];
  return grouped(ids.map((id) => ({ kind: proficiencyKind(id, content) ?? 'other', item: itemOf(id, content) })));
}

/** Every proficiency not in `have`, by kind, to add from a list. */
export function addableProficiencies(
  have: readonly string[],
  content: Pick<Content, 'items' | 'edition'>,
): ProficiencyGroup[] {
  const owned = new Set(have.map((p) => toProficiency(p, content)));
  const options = proficiencyOptions(content).filter((o) => !owned.has(o.id));
  return grouped(options.map((o) => ({ kind: o.kind, item: itemOf(o.id, content) })));
}
