import type { Content } from './content.ts';
import { at, list, type Loose, num, obj, str } from './foundry-data.ts';
import { proficiencyKind, toProficiency } from './proficiency-catalog.ts';

// A Foundry dnd5e creature's armor, weapon, tool and language proficiencies
// (system.traits, and system.tools from dnd5e 3), as the ids of our lists
// (proficiency-catalog.ts). Foundry's own codes ("lgt", "deep", "thief")
// are spelled out; a typed-in extra ("Whips; Old Tongue") is matched by
// name, and kept as written when it names nothing we know.

const ARMOR: Record<string, string> = { lgt: 'light-armor', med: 'medium-armor', hvy: 'heavy-armor', shl: 'shields' };

/** Foundry's weapon codes that are not our ids with the dashes taken out. */
const WEAPONS: Record<string, string> = {
  sim: 'simple-weapons',
  mar: 'martial-weapons',
  handcrossbow: 'hand-crossbow',
  heavycrossbow: 'heavy-crossbow',
  lightcrossbow: 'light-crossbow',
  lighthammer: 'light-hammer',
  warpick: 'war-pick',
};

const LANGUAGES: Record<string, string> = {
  deep: 'deep-speech',
  cant: 'thieves-cant',
  sign: 'common-sign-language',
  aquan: 'primordial',
  auran: 'primordial',
  ignan: 'primordial',
  terran: 'primordial',
};

const TOOLS: Record<string, string> = {
  thief: 'thieves-tools',
  disg: 'disguise-kit',
  forg: 'forgery-kit',
  herb: 'herbalism-kit',
  navg: 'navigators-tools',
  pois: 'poisoners-kit',
  chess: 'dragonchess-set',
  dice: 'dice-set',
  card: 'playing-card-set',
  panflute: 'pan-flute',
  land: 'vehicles-land',
  water: 'vehicles-water',
  alchemist: 'alchemists-supplies',
  brewer: 'brewers-supplies',
  calligrapher: 'calligraphers-supplies',
  painter: 'painters-supplies',
  cook: 'cooks-utensils',
};

/** A word as one of ours: by name, else (a plural, "Whips") without its last s; as written when neither. */
function fromWord(word: string, content: Content): string {
  const ours = (w: string) => {
    const id = toProficiency(w, content);
    return proficiencyKind(id, content) ? id : undefined;
  };
  return ours(word) ?? (word.endsWith('s') ? ours(word.slice(0, -1)) : undefined) ?? word;
}

/** A Foundry code as ours: its own name, else our id ("longsword"), else the tool or word it names. */
function fromCode(code: string, table: Record<string, string>, content: Content): string {
  if (table[code]) return table[code];
  for (const id of [code, `${code}s-tools`]) if (proficiencyKind(id, content)) return id;
  return code[0]!.toUpperCase() + code.slice(1);
}

/** A trait's codes and typed-in extras ("a; b"). */
function trait(sys: Loose, key: string, table: Record<string, string>, content: Content): string[] {
  const t = obj(at(sys, `traits.${key}`));
  const codes = list(t.value).flatMap((c) => (typeof c === 'string' ? [fromCode(c, table, content)] : []));
  const custom = (str(t.custom) ?? '')
    .split(';')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => fromWord(w, content));
  return [...codes, ...custom];
}

/** Tools: dnd5e 3's `system.tools` (proficient at 1 or more), else the older `traits.toolProf`. */
function toolsOf(sys: Loose, content: Content): string[] {
  const tools = Object.entries(obj(sys.tools));
  if (!tools.length) return trait(sys, 'toolProf', TOOLS, content);
  return tools.filter(([, t]) => (num(obj(t).value) ?? 0) >= 1).map(([code]) => fromCode(code, TOOLS, content));
}

/** Its armor, weapon, tool and language proficiencies, each once. */
export function foundryProficiencies(sys: Loose, content: Content): string[] {
  return [
    ...new Set([
      ...trait(sys, 'armorProf', ARMOR, content),
      ...trait(sys, 'weaponProf', WEAPONS, content),
      ...toolsOf(sys, content),
      ...trait(sys, 'languages', LANGUAGES, content),
    ]),
  ];
}
