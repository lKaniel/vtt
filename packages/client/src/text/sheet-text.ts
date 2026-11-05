import {
  type Ability,
  type CasterSheet,
  characterLevel,
  checkBonus,
  type Creature,
  type Edition,
  type FeatureSheet,
  type InventoryEntry,
  type Item,
  nextLevelXp,
  type Own,
  passiveScore,
  type Skill,
  SKILLS,
  skillName,
  type Spell,
  type Stats,
  type Token,
} from '@vtt/system-dnd5e';
import { contentFor } from '../content/content.ts';
import { t } from '../i18n/index.ts';

// What the character sheet lists, worked out from the creature: its skills,
// its gear by kind, its features and spells in columns, and the bar of
// experience in the header.

export const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export interface SkillRow {
  skill: Skill;
  name: string;
  ability: Ability;
  bonus: number;
  passive: number;
  proficient: boolean;
  /** Proficiency counts twice. */
  expert: boolean;
}

/** All 18 skills by name, with the creature's bonus and passive score in each. */
export function skillRows(token: Pick<Token, 'stats'>, sheet: Creature): SkillRow[] {
  return (Object.keys(SKILLS) as Skill[]).map((skill) => ({
    skill,
    name: skillName(skill),
    ability: SKILLS[skill],
    bonus: checkBonus(token, sheet, { ability: SKILLS[skill], skill }),
    passive: passiveScore(token, sheet, skill),
    proficient: token.stats?.skills?.includes(skill) === true,
    expert: token.stats?.expertise?.includes(skill) === true,
  }));
}

export interface XpProgress {
  xp: number;
  /** XP for the next level; undefined at 20th. */
  next?: number;
  /** How far from this level to the next, 0 to 100. */
  percent: number;
}

/** The experience bar: from the start of the character's level to the next; undefined without XP. */
export function xpProgress(stats: Stats | undefined): XpProgress | undefined {
  const xp = stats?.xp;
  const level = characterLevel(stats);
  if (xp === undefined || !level) return undefined;
  const next = nextLevelXp(level);
  if (next === undefined) return { xp, percent: 100 };
  const from = level > 1 ? (nextLevelXp(level - 1) ?? 0) : 0;
  const percent = Math.floor(((xp - from) / (next - from)) * 100);
  return { xp, next, percent: Math.max(0, Math.min(100, percent)) };
}

export type GearKind = 'weapons' | 'armour' | 'consumables' | 'gear';

export interface InventorySection {
  /** A kind of gear, or `container-<index>` for what is packed in a container. */
  id: GearKind | `container-${number}`;
  /** Inventory indexes, in their order. */
  indexes: number[];
  /** A container's name and its inventory index. */
  name?: string;
  container?: number;
}

const KINDS: readonly GearKind[] = ['weapons', 'armour', 'consumables', 'gear'];

function kindOf(item: Item | undefined): GearKind {
  if (item?.type === 'weapon') return 'weapons';
  if (item?.type === 'armor') return 'armour';
  return item?.type === 'gear' && item.use ? 'consumables' : 'gear';
}

/** The inventory as Foundry lists it: loose gear by kind, then each container with what is in it. */
export function inventorySections(
  list: readonly InventoryEntry[],
  rules: Edition,
  sheet: { own?: Own } = {},
): InventorySection[] {
  const items = contentFor(sheet, rules).items;
  const ids = new Set(list.flatMap((e) => (e.id ? [e.id] : [])));
  const loose = list.flatMap((e, i) => (e.in && ids.has(e.in) ? [] : [i]));
  const byKind = KINDS.map((id) => ({ id, indexes: loose.filter((i) => kindOf(items.get(list[i]!.item)) === id) }));
  const boxes = list.flatMap((e, index): InventorySection[] => {
    const item = items.get(e.item);
    if (item?.type !== 'gear' || !item.container) return [];
    const indexes = e.id ? list.flatMap((c, i) => (c.in === e.id ? [i] : [])) : [];
    return [{ id: `container-${index}`, indexes, name: item.name, container: index }];
  });
  return [...byKind.filter((s) => s.indexes.length), ...boxes];
}

export interface FeatureSection {
  id: 'active' | 'passive';
  features: FeatureSheet[];
}

/** Features taken as actions first (Foundry's Active), then the always-on ones. */
export function featureSections(features: readonly FeatureSheet[]): FeatureSection[] {
  const sections: FeatureSection[] = [
    { id: 'active', features: features.filter((f) => f.action) },
    { id: 'passive', features: features.filter((f) => !f.action) },
  ];
  return sections.filter((s) => s.features.length);
}

const TIME: Record<Spell['castingTime'], () => string> = {
  action: () => t('sheet.time.action'),
  bonus: () => t('sheet.time.bonus'),
  reaction: () => t('sheet.time.reaction'),
  minute: () => t('sheet.time.minute'),
  hour: () => t('sheet.time.hour'),
};

function spellRange(s: Spell): string {
  if (s.range === 0) return t('sheet.range.self');
  if (s.range === 5) return t('sheet.range.touch');
  return t('sheet.feet', { n: s.range });
}

function spellRoll(s: Spell, caster: CasterSheet | undefined): string {
  if (s.attack) return caster ? signed(caster.attack) : t('sheet.roll.attack');
  if (s.save) {
    const ability = s.save.ability.toUpperCase();
    return caster ? t('sheet.roll.saveDc', { ability, dc: caster.dc }) : t('sheet.roll.save', { ability });
  }
  if (s.heal) return t('sheet.roll.heal');
  return '';
}

/** A spell's columns on the sheet: casting time, range, and its roll (an attack, a save or healing). */
export function spellColumns(s: Spell, caster: CasterSheet | undefined): { time: string; range: string; roll: string } {
  return { time: TIME[s.castingTime](), range: spellRange(s), roll: spellRoll(s, caster) };
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Does a name match what was typed in the sheet's search box? */
export function matches(name: string, query: string): boolean {
  return fold(name).includes(fold(query.trim()));
}
