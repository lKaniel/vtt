import type { Attack, Condition, DamageType, EffectTemplate, Feature, Item, Spell } from '@vtt/shared';
import { effectTone } from './vitals.ts';

// Which icon and colour each action tile, effect and log line gets. The glyphs
// themselves are SVG paths in ui/Icon.tsx; tints are CSS classes in style.css.

export type Glyph =
  | 'sword'
  | 'mace'
  | 'bow'
  | 'claw'
  | 'flame'
  | 'snowflake'
  | 'lightning'
  | 'wave'
  | 'drop'
  | 'vial'
  | 'skull'
  | 'sun'
  | 'bolts'
  | 'eye'
  | 'heart'
  | 'paw'
  | 'mist'
  | 'shield'
  | 'chain'
  | 'star'
  | 'mask'
  | 'swirl'
  | 'fist'
  | 'boot';

export type Tint = DamageType | 'heal' | 'steel' | 'arcane' | SchoolTint;
type SchoolTint = 'abjuration' | 'divination' | 'enchantment' | 'illusion' | 'necromancy' | 'transmutation';

export interface Icon {
  glyph: Glyph;
  tint: Tint;
  /** A painted icon to show instead of the glyph, from icon-art.ts. */
  art?: string;
}

const DAMAGE_GLYPH: Record<DamageType, Glyph> = {
  acid: 'drop',
  bludgeoning: 'mace',
  cold: 'snowflake',
  fire: 'flame',
  force: 'bolts',
  lightning: 'lightning',
  necrotic: 'skull',
  piercing: 'bow',
  poison: 'vial',
  psychic: 'eye',
  radiant: 'sun',
  slashing: 'sword',
  thunder: 'wave',
};

const SCHOOL: Record<string, Icon> = {
  abjuration: { glyph: 'shield', tint: 'abjuration' },
  conjuration: { glyph: 'paw', tint: 'arcane' },
  divination: { glyph: 'eye', tint: 'divination' },
  enchantment: { glyph: 'chain', tint: 'enchantment' },
  evocation: { glyph: 'star', tint: 'arcane' },
  illusion: { glyph: 'mask', tint: 'illusion' },
  necromancy: { glyph: 'skull', tint: 'necromancy' },
  transmutation: { glyph: 'swirl', tint: 'transmutation' },
};

function schoolIcon(school: string): Icon {
  return SCHOOL[school.toLowerCase()] ?? { glyph: 'star', tint: 'arcane' };
}

const HELPFUL_ICON = (e: EffectTemplate): Icon =>
  e.ac ? { glyph: 'shield', tint: 'abjuration' } : { glyph: 'sun', tint: 'radiant' };

function spellEffectIcon(spell: Spell): Icon | undefined {
  const effect = spell.effect;
  if (!effect) return undefined;
  return effectTone(effect) === 'harmful' ? schoolIcon(spell.school) : HELPFUL_ICON(effect);
}

export function spellIcon(spell: Spell): Icon {
  if (spell.heal) return { glyph: 'heart', tint: 'heal' };
  if (spell.summon) return { glyph: 'paw', tint: 'arcane' };
  if (spell.teleport) return { glyph: 'mist', tint: 'arcane' };
  const damage = spell.damage[0]?.type;
  if (damage) return { glyph: DAMAGE_GLYPH[damage], tint: damage };
  return spellEffectIcon(spell) ?? schoolIcon(spell.school);
}

const NATURAL = /\b(bite|claw|claws|talon|talons|gore|horn|horns|tail|slam|tentacle|beak|hoof|hooves|fist)\b/i;

export function attackIcon(attack: Attack): Icon {
  if (NATURAL.test(attack.name)) return { glyph: 'claw', tint: 'steel' };
  if (attack.kind === 'ranged') return { glyph: 'bow', tint: 'steel' };
  const blunt = attack.damage[0]?.type === 'bludgeoning';
  return { glyph: blunt ? 'mace' : 'sword', tint: 'steel' };
}

export function featureIcon(feature: Pick<Feature, 'heal' | 'effect' | 'grantAction'>): Icon {
  if (feature.heal) return { glyph: 'heart', tint: 'heal' };
  if (feature.effect) return { glyph: 'fist', tint: 'fire' };
  if (feature.grantAction) return { glyph: 'boot', tint: 'steel' };
  return { glyph: 'star', tint: 'arcane' };
}

const HELD: Icon = { glyph: 'chain', tint: 'enchantment' };
const OUT: Icon = { glyph: 'skull', tint: 'necromancy' };

const CONDITION: Record<Condition, Icon> = {
  blinded: { glyph: 'eye', tint: 'necromancy' },
  charmed: { glyph: 'heart', tint: 'enchantment' },
  deafened: { glyph: 'wave', tint: 'thunder' },
  frightened: OUT,
  grappled: HELD,
  incapacitated: HELD,
  invisible: { glyph: 'mask', tint: 'illusion' },
  paralyzed: HELD,
  petrified: HELD,
  poisoned: { glyph: 'vial', tint: 'poison' },
  prone: { glyph: 'boot', tint: 'steel' },
  restrained: HELD,
  stunned: { glyph: 'star', tint: 'enchantment' },
  unconscious: OUT,
};

/** The badge for an effect on a creature: its first condition, else whether it helps. */
export function effectIcon(effect: EffectTemplate): Icon {
  const condition = effect.conditions?.[0];
  if (condition) return CONDITION[condition];
  return effectTone(effect) === 'harmful' ? { glyph: 'swirl', tint: 'necromancy' } : HELPFUL_ICON(effect);
}

const GEAR: Record<string, Icon> = {
  'potion-of-healing': { glyph: 'vial', tint: 'heal' },
  'healer-s-kit': { glyph: 'heart', tint: 'heal' },
  torch: { glyph: 'flame', tint: 'fire' },
};
const PLAIN: Icon = { glyph: 'star', tint: 'steel' };

export function itemIcon(item: Item | undefined): Icon {
  if (item?.type === 'weapon') {
    const glyph = item.damage.type === 'bludgeoning' ? 'mace' : 'sword';
    return { glyph: item.kind === 'ranged' ? 'bow' : glyph, tint: 'steel' };
  }
  if (item?.type === 'armor') return { glyph: 'shield', tint: 'steel' };
  return GEAR[item?.id ?? ''] ?? PLAIN;
}
