import type { Content } from './content.ts';
import type { Armor, Weapon } from './item-schema.ts';
import type { ClassLevel } from './multiclass.ts';
import { toProficiency } from './proficiency-catalog.ts';
import type { Effect } from './spell-schema.ts';
import type { Token } from './token-schema.ts';

// Proficiencies at work on a creature's sheet: the weapons it adds its
// proficiency bonus to, armor that hinders it, and tools it checks with.
// A character's are what its stats list plus what its classes give (the
// first class all of it, later ones their multiclass share). Monsters, and
// characters with a class that doesn't say, are trained with everything.

export interface Training {
  /** Proficiency ids, and words written before there was a list. */
  list: string[];
  /** Weapons and armor count only when listed. */
  strict: boolean;
}

/** The class's grants for its place in the character: the first class's, or its multiclass share. */
function classGrants(level: ClassLevel, first: boolean): string[] | undefined {
  const training = level.cls?.proficiencies;
  if (!training) return undefined;
  return first ? training.fixed : (training.multiclass?.fixed ?? []);
}

/** What `token` is trained with. */
export function trainingOf(token: Token, levels: readonly ClassLevel[], content: Content): Training {
  const own = (token.stats?.proficiencies ?? []).map((p) => toProficiency(p, content));
  const grants = levels.map((l, i) => classGrants(l, i === 0));
  const strict = !token.monster && levels.length > 0 && grants.every((g) => g !== undefined);
  return { list: [...new Set([...own, ...grants.flatMap((g) => g ?? [])])], strict };
}

/** Whether the weapon's group, or the weapon itself, is in the list. */
function weaponListed(weapon: Weapon, list: readonly string[]): boolean {
  if (list.includes(weapon.base ?? weapon.id)) return true;
  if (weapon.category === 'simple') return list.includes('simple-weapons');
  if (list.includes('martial-weapons')) return true;
  const light = weapon.properties.includes('light');
  if (light && list.includes('martial-light-weapons')) return true;
  return (light || weapon.properties.includes('finesse')) && list.includes('martial-finesse-light-weapons');
}

export function trainedWithWeapon(training: Training, weapon: Weapon): boolean {
  return !training.strict || weaponListed(weapon, training.list);
}

const ARMOR_PROFICIENCY = { light: 'light-armor', medium: 'medium-armor', heavy: 'heavy-armor', shield: 'shields' };

/** Armor or a shield worn without training: disadvantage on attacks and Strength and Dexterity rolls, and no spells. */
export const UNTRAINED_ARMOR: Effect = {
  id: 'untrained-armor',
  name: 'Armor without training',
  disadvantage: true,
  saveDisadvantageFor: ['str', 'dex'],
  checkDisadvantageFor: ['str', 'dex'],
  noCasting: true,
};

/** The effect of worn armor the creature isn't trained with, if any. */
export function armorEffects(training: Training, armor: readonly Armor[]): Effect[] {
  if (!training.strict) return [];
  const untrained = armor.some((a) => !training.list.includes(ARMOR_PROFICIENCY[a.category]));
  return untrained ? [UNTRAINED_ARMOR] : [];
}
