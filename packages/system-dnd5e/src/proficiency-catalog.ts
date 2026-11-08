import type { Content } from './content.ts';
import type { Ability, Edition } from './stats-schema.ts';
import type { Weapon } from './item-schema.ts';

// Every proficiency a character can have besides skills and saves: armor,
// weapons, tools and languages, by id. Weapons are a group (simple, martial)
// or one weapon by its item id. A stat may still hold a word typed before
// these were picked from a list; it stays as written.

export type ProficiencyKind = 'armor' | 'weapon' | 'tool' | 'language';

export interface ProficiencyOption {
  id: string;
  name: string;
  kind: ProficiencyKind;
  /** Tools: artisan's tools, gaming sets, musical instruments or other kits. */
  group?: ToolGroup;
}

export const ARMOR = {
  'light-armor': 'Light armor',
  'medium-armor': 'Medium armor',
  'heavy-armor': 'Heavy armor',
  shields: 'Shields',
} as const;

export const WEAPON_GROUPS = {
  'simple-weapons': 'Simple weapons',
  'martial-weapons': 'Martial weapons',
  'martial-light-weapons': 'Martial weapons with the Light property',
  'martial-finesse-light-weapons': 'Martial weapons with the Finesse or Light property',
} as const;

export type ToolGroup = 'artisan' | 'gaming' | 'music' | 'kit';

interface Tool {
  name: string;
  group: ToolGroup;
  /** The ability its checks use (2024 rules); the player may pick another. */
  ability: Ability;
}

const artisan = (name: string, ability: Ability): Tool => ({ name, group: 'artisan', ability });
const gaming = (name: string): Tool => ({ name, group: 'gaming', ability: 'wis' });
const music = (name: string): Tool => ({ name, group: 'music', ability: 'cha' });
const kit = (name: string, ability: Ability): Tool => ({ name, group: 'kit', ability });

export const TOOLS: Record<string, Tool> = {
  'alchemists-supplies': artisan("Alchemist's Supplies", 'int'),
  'brewers-supplies': artisan("Brewer's Supplies", 'int'),
  'calligraphers-supplies': artisan("Calligrapher's Supplies", 'dex'),
  'carpenters-tools': artisan("Carpenter's Tools", 'str'),
  'cartographers-tools': artisan("Cartographer's Tools", 'wis'),
  'cobblers-tools': artisan("Cobbler's Tools", 'dex'),
  'cooks-utensils': artisan("Cook's Utensils", 'wis'),
  'glassblowers-tools': artisan("Glassblower's Tools", 'int'),
  'jewelers-tools': artisan("Jeweler's Tools", 'int'),
  'leatherworkers-tools': artisan("Leatherworker's Tools", 'dex'),
  'masons-tools': artisan("Mason's Tools", 'str'),
  'painters-supplies': artisan("Painter's Supplies", 'wis'),
  'potters-tools': artisan("Potter's Tools", 'int'),
  'smiths-tools': artisan("Smith's Tools", 'str'),
  'tinkers-tools': artisan("Tinker's Tools", 'dex'),
  'weavers-tools': artisan("Weaver's Tools", 'dex'),
  'woodcarvers-tools': artisan("Woodcarver's Tools", 'dex'),
  'dice-set': gaming('Dice Set'),
  'dragonchess-set': gaming('Dragonchess Set'),
  'playing-card-set': gaming('Playing Card Set'),
  'three-dragon-ante-set': gaming('Three-Dragon Ante Set'),
  bagpipes: music('Bagpipes'),
  drum: music('Drum'),
  dulcimer: music('Dulcimer'),
  flute: music('Flute'),
  horn: music('Horn'),
  lute: music('Lute'),
  lyre: music('Lyre'),
  'pan-flute': music('Pan Flute'),
  shawm: music('Shawm'),
  viol: music('Viol'),
  'disguise-kit': kit('Disguise Kit', 'cha'),
  'forgery-kit': kit('Forgery Kit', 'dex'),
  'herbalism-kit': kit('Herbalism Kit', 'int'),
  'navigators-tools': kit("Navigator's Tools", 'wis'),
  'poisoners-kit': kit("Poisoner's Kit", 'int'),
  'thieves-tools': kit("Thieves' Tools", 'dex'),
  'vehicles-land': kit('Vehicles (land)', 'dex'),
  'vehicles-water': kit('Vehicles (water)', 'dex'),
};

/** Standard languages anyone may learn, exotic (2014) or rare (2024) ones, and secret ones only a class teaches. */
type Tier = 'standard' | 'rare' | 'secret';

interface Language {
  name: string;
  tier: Record<Edition, Tier>;
  /** Only in this edition's lists (sign language is 2024's). */
  only?: Edition;
}

const lang = (name: string, t2014: Tier, t2024: Tier = t2014): Language => ({
  name,
  tier: { '2014': t2014, '2024': t2024 },
});

export const LANGUAGES: Record<string, Language> = {
  common: lang('Common', 'standard'),
  'common-sign-language': { ...lang('Common Sign Language', 'standard'), only: '2024' },
  draconic: lang('Draconic', 'rare', 'standard'),
  dwarvish: lang('Dwarvish', 'standard'),
  elvish: lang('Elvish', 'standard'),
  giant: lang('Giant', 'standard'),
  gnomish: lang('Gnomish', 'standard'),
  goblin: lang('Goblin', 'standard'),
  halfling: lang('Halfling', 'standard'),
  orc: lang('Orc', 'standard'),
  abyssal: lang('Abyssal', 'rare'),
  celestial: lang('Celestial', 'rare'),
  'deep-speech': lang('Deep Speech', 'rare'),
  infernal: lang('Infernal', 'rare'),
  primordial: lang('Primordial', 'rare'),
  sylvan: lang('Sylvan', 'rare'),
  undercommon: lang('Undercommon', 'rare'),
  druidic: lang('Druidic', 'secret'),
  'thieves-cant': lang("Thieves' Cant", 'secret'),
};

const NAMED: Record<string, string> = {
  ...ARMOR,
  ...WEAPON_GROUPS,
  ...Object.fromEntries(Object.entries(TOOLS).map(([id, t]) => [id, t.name])),
  ...Object.fromEntries(Object.entries(LANGUAGES).map(([id, l]) => [id, l.name])),
};

/** Words for a proficiency that don't slug to its id. */
const ALIASES: Record<string, string> = {
  shield: 'shields',
  light: 'light-armor',
  medium: 'medium-armor',
  heavy: 'heavy-armor',
  simple: 'simple-weapons',
  martial: 'martial-weapons',
};

const slug = (word: string) =>
  word
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const BY_NAME = new Map(Object.entries(NAMED).map(([id, name]) => [slug(name), id]));

/** The id of a proficiency written as a word ("Thieves' tools"), or the word itself when it names none. */
export function toProficiency(word: string, content?: Pick<Content, 'items'>): string {
  const s = slug(word);
  if (NAMED[s]) return s;
  const weapon = content?.items.get(s)?.type === 'weapon';
  return ALIASES[s] ?? BY_NAME.get(s) ?? (weapon ? s : word);
}

/** Weapons by item id, each once, from the edition's mundane weapons. */
function weaponsOf(content: Pick<Content, 'items'>): Weapon[] {
  const out: Weapon[] = [];
  for (const item of content.items.values()) {
    if (item.type === 'weapon' && !item.magic && !item.base) out.push(item);
  }
  return out;
}

/** What to show for a proficiency: its name, or the word as written. */
export function proficiencyName(id: string, content?: Pick<Content, 'items'>): string {
  return NAMED[id] ?? content?.items.get(id)?.name ?? id;
}

/** The kind of a proficiency id; undefined for a word that names none. */
export function proficiencyKind(id: string, content: Pick<Content, 'items'>): ProficiencyKind | undefined {
  if (id in ARMOR) return 'armor';
  if (id in WEAPON_GROUPS || content.items.get(id)?.type === 'weapon') return 'weapon';
  if (id in TOOLS) return 'tool';
  return id in LANGUAGES ? 'language' : undefined;
}

/** Every proficiency there is to pick, armor first, then weapons, tools and languages. */
export function proficiencyOptions(content: Pick<Content, 'items' | 'edition'>): ProficiencyOption[] {
  const named = (kind: ProficiencyKind, list: Record<string, string>) =>
    Object.entries(list).map(([id, name]) => ({ id, name, kind }));
  const weapons = weaponsOf(content)
    .map((w) => ({ id: w.id, name: w.name, kind: 'weapon' as const }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const tools = Object.entries(TOOLS).map(([id, t]) => ({ id, name: t.name, kind: 'tool' as const, group: t.group }));
  const languages = Object.entries(LANGUAGES)
    .filter(([, l]) => !l.only || l.only === content.edition)
    .map(([id, l]) => ({ id, name: l.name, kind: 'language' as const }));
  // 2024's weapon groups (a monk's, a rogue's) only in 2024 lists.
  const groups = named('weapon', WEAPON_GROUPS).filter((g) => content.edition === '2024' || !g.id.includes('light'));
  return [...named('armor', ARMOR), ...groups, ...weapons, ...tools, ...languages];
}

/** Groups a choice may offer instead of naming each option. */
const GROUPS: Record<string, (edition: Edition) => string[]> = {
  'artisans-tools': () => toolsIn('artisan'),
  'gaming-sets': () => toolsIn('gaming'),
  'musical-instruments': () => toolsIn('music'),
  tools: () => Object.keys(TOOLS),
  languages: (e) => languagesUpTo(e, 'rare'),
  'standard-languages': (e) => languagesUpTo(e, 'standard'),
};

const toolsIn = (group: ToolGroup) => Object.keys(TOOLS).filter((id) => TOOLS[id]!.group === group);

function languagesUpTo(edition: Edition, most: Tier): string[] {
  const allowed: Tier[] = most === 'standard' ? ['standard'] : ['standard', 'rare'];
  return Object.entries(LANGUAGES)
    .filter(([, l]) => (!l.only || l.only === edition) && allowed.includes(l.tier[edition]))
    .map(([id]) => id);
}

/** A choice's `from`, groups opened up into their members, each once. */
export function expandFrom(from: readonly string[], edition: Edition): string[] {
  return [...new Set(from.flatMap((f) => GROUPS[f]?.(edition) ?? [f]))];
}

/** What a choice's options are called, for "Choose 2 languages". */
export function choiceNoun(options: readonly string[], count: number): string {
  const kindOf = (id: string) => {
    if (id in LANGUAGES) return 'language';
    return id in TOOLS ? 'tool' : 'proficiency';
  };
  const kinds = new Set(options.map(kindOf));
  const noun = kinds.size === 1 ? [...kinds][0]! : 'proficiency';
  if (count === 1) return noun;
  return noun === 'proficiency' ? 'proficiencies' : `${noun}s`;
}
