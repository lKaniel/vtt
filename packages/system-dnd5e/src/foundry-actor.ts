import { type FoundrySheets, freeId, type ImportLoss, slugify } from '@vtt/core';
import { type Content, srdFor, toEdition } from './content.ts';
import { at, list, type Loose, num, obj, opt, paragraphs, plainText, str } from './foundry-data.ts';
import { foundryEffects } from './foundry-effects.ts';
import { attackOf, byName, GEAR_TYPES, gearOf, ownItem } from './foundry-gear.ts';
import { ownSpell } from './foundry-spells.ts';
import { stateOf } from './foundry-state.ts';
import { foundryProficiencies } from './foundry-proficiencies.ts';
import { ABILITIES, type Abilities, DamageTypeSchema, type Stats } from './stats-schema.ts';
import type { Feature, Spell } from './spell-schema.ts';
import type { Actor } from './token-schema.ts';

// A Foundry VTT dnd5e actor as our sheet (what goes in actors/<id>.json
// besides its id, name, picture, size on the map and ownership, which the
// import reads itself). A monster the SRD has by name uses that stat block;
// any other creature is read from its numbers, and its items are matched to
// the SRD by name, the rest kept on the sheet as its own.

export interface FoundrySheetContext {
  /** The game's rules edition. */
  rules: string;
}

export type Sheet = Partial<Omit<Actor, 'id' | 'name' | 'img' | 'ownership' | 'folder'>>;

export interface ConvertedSheet {
  sheet: Sheet;
  /** What could not come along. */
  skipped: ImportLoss[];
}

const SIZES: Record<string, number> = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

const SKILLS: Record<string, string> = {
  acr: 'acrobatics',
  ani: 'animal-handling',
  arc: 'arcana',
  ath: 'athletics',
  dec: 'deception',
  his: 'history',
  ins: 'insight',
  itm: 'intimidation',
  inv: 'investigation',
  med: 'medicine',
  nat: 'nature',
  prc: 'perception',
  prf: 'performance',
  per: 'persuasion',
  rel: 'religion',
  slt: 'sleight-of-hand',
  ste: 'stealth',
  sur: 'survival',
};

const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'] as const;

function abilitiesOf(sys: Loose): Abilities {
  const out = {} as Abilities;
  for (const a of ABILITIES) out[a] = Math.min(30, Math.max(1, Math.round(num(at(sys, `abilities.${a}.value`)) ?? 10)));
  return out;
}

/** Size, speed and senses: the parts of the sheet the map uses. */
function bodyOf(sys: Loose): Sheet {
  const size = SIZES[str(at(sys, 'traits.size')) ?? 'med'] ?? 1;
  const speed = num(at(sys, 'attributes.movement.walk'));
  const senses = obj(at(sys, 'attributes.senses.ranges') ?? at(sys, 'attributes.senses'));
  const out: Sheet = {
    ...opt('size', size !== 1 && size),
    ...opt('speed', speed !== undefined && speed !== 30 && speed),
  };
  for (const s of SENSES) {
    const range = num(senses[s]);
    if (range) out[s] = range;
  }
  return out;
}

/** Current and temporary hit points, when they differ from an unhurt creature's. */
function woundsOf(sys: Loose): Sheet {
  const hp = obj(at(sys, 'attributes.hp'));
  const [value, max, temp] = [num(hp.value), num(hp.max), num(hp.temp)];
  return {
    ...opt('hp', value !== undefined && max !== undefined && value < max && Math.round(value)),
    ...opt('tempHp', temp !== undefined && temp > 0 && Math.round(temp)),
  };
}

const damageTypes = (x: unknown) => list(obj(x).value).flatMap((t) => DamageTypeSchema.safeParse(t).data ?? []);

function defensesOf(sys: Loose): Partial<Stats> {
  const [dr, di, dv] = ['dr', 'di', 'dv'].map((k) => damageTypes(at(sys, `traits.${k}`)));
  return {
    ...opt('resistances', dr!.length > 0 && dr),
    ...opt('immunities', di!.length > 0 && di),
    ...opt('vulnerabilities', dv!.length > 0 && dv),
  };
}

function skillsOf(sys: Loose): string[] {
  return Object.entries(obj(sys.skills)).flatMap(([code, s]) => {
    const level = num(obj(s).value) ?? num(obj(s).proficient) ?? 0;
    return level >= 1 && SKILLS[code] ? [SKILLS[code]] : [];
  });
}

/** A flat or natural armor class; a computed one comes from the gear. */
function acOf(sys: Loose): number | undefined {
  const ac = obj(at(sys, 'attributes.ac'));
  return ['flat', 'natural'].includes(str(ac.calc) ?? '') ? num(ac.flat) : undefined;
}

interface Classes {
  stats: Partial<Stats>;
  /** SRD classes it has, for telling class features from others. */
  srd: string[];
  skipped: ImportLoss[];
}

interface FoundryClass {
  name: string;
  levels: number;
  id: string;
  /** Foundry's identifier, which its subclass items point at. */
  key?: string;
  first: boolean;
}

function foundryClass(i: Loose, srd: Content, original: string | undefined): FoundryClass {
  const name = str(i.name)!;
  const id = byName(srd.classes, name) ?? slugify(name);
  const key = str(at(i, 'system.identifier'));
  return {
    name,
    levels: Math.max(1, num(at(i, 'system.levels')) ?? 1),
    id,
    key,
    first: !!original && i._id === original,
  };
}

/** Subclass ids by the identifier of the class they belong to. */
function subclassesOf(items: Loose[]): Map<string, string> {
  const subs = items.filter((i) => i.type === 'subclass' && str(i.name));
  return new Map(subs.map((i) => [str(at(i, 'system.classIdentifier')) ?? '', slugify(str(i.name)!)]));
}

/** Its classes, the original one first: one is `class` and `level`, several are `classes`. */
function classesOf(items: Loose[], srd: Content, sys: Loose): Classes {
  const original = str(at(sys, 'details.originalClass'));
  const classes = items
    .filter((i) => i.type === 'class' && str(i.name))
    .map((i) => foundryClass(i, srd, original))
    .sort((a, b) => Number(b.first) - Number(a.first));
  const main = classes[0];
  if (!main) return { stats: {}, srd: [], skipped: [] };
  const srdIds = classes.flatMap((c) => byName(srd.classes, c.name) ?? []);
  if (classes.length === 1)
    return { stats: { class: main.name, level: Math.min(20, main.levels) }, srd: srdIds, skipped: [] };
  const subs = subclassesOf(items);
  const entries = classes.map((c) => {
    const subclass = subs.get(c.key ?? c.id);
    return { class: c.id, level: Math.min(20, c.levels), ...(subclass && { subclass }) };
  });
  return { stats: { classes: entries }, srd: srdIds, skipped: [] };
}

/** Its spells: the SRD's by name, the rest as spells of its own. */
function spellsOf(items: Loose[], srd: Content): { spells: string[]; own: Spell[] } {
  const spells: string[] = [];
  const own: Spell[] = [];
  for (const item of items.filter((i) => i.type === 'spell')) {
    const name = str(item.name) ?? 'Spell';
    const known = byName(srd.spells, name);
    if (known) spells.push(known);
    else if (!own.some((o) => o.name === name)) {
      const taken = (x: string) => srd.spells.has(x) || own.some((o) => o.id === x);
      own.push(ownSpell(item, freeId(slugify(name) || 'spell', taken, { bare: true })));
    }
  }
  return { spells, own };
}

/** Features that aren't its SRD classes' own (those come with the class), as features of its own. */
function featuresOf(items: Loose[], srd: Content, classes: string[]): Feature[] {
  const classFeatures = new Set(classes.flatMap((c) => srd.classes.get(c)?.features.map((f) => f.id) ?? []));
  return items
    .filter((i) => i.type === 'feat' && str(i.name) && !classFeatures.has(slugify(str(i.name)!)))
    .map((i) => {
      const description = plainText(str(at(i, 'system.description.value')) ?? '');
      return { id: slugify(str(i.name)!) || 'feature', name: str(i.name)!, level: 1, description } as Feature;
    });
}

/** Proficiency of a creature with a challenge rating and no level. */
const crProficiency = (cr: number) => 2 + Math.floor((Math.max(cr, 1) - 1) / 4);

function npcAttacks(items: Loose[], srd: Content, scores: Abilities, prof: number): Partial<Stats> {
  const attacks = items.flatMap((i) => (i.type === 'weapon' ? (attackOf(i, srd, scores, prof) ?? []) : []));
  return opt('attacks', attacks.length > 0 && attacks);
}

interface Read {
  sys: Loose;
  items: Loose[];
  npc: boolean;
  srd: Content;
}

/** The numbers of a creature read from its sheet. */
function statsOf({ sys, items, npc, srd }: Read, classes: Classes, spells: string[]): Stats {
  const abilities = abilitiesOf(sys);
  const prof = crProficiency(num(at(sys, 'details.cr')) ?? 0);
  const maxHp = num(at(sys, 'attributes.hp.max'));
  const skills = skillsOf(sys);
  const trained = foundryProficiencies(sys, srd).slice(0, 80);
  return {
    abilities,
    ...opt('maxHp', maxHp !== undefined && maxHp > 0 && Math.round(maxHp)),
    ...opt('ac', acOf(sys)),
    ...classes.stats,
    ...(npc && !classes.stats.level && !classes.stats.classes ? { proficiency: prof } : {}),
    ...defensesOf(sys),
    ...opt('skills', skills.length > 0 && skills),
    ...opt('proficiencies', trained.length > 0 && trained),
    ...opt('spells', spells.length > 0 && spells),
    ...(npc ? npcAttacks(items, srd, abilities, prof) : {}),
  };
}

/** A creature read from its numbers: a character, or a monster the SRD doesn't have. */
function builtSheet(data: Loose, srd: Content): ConvertedSheet {
  const read: Read = { sys: obj(data.system), items: list(data.items).map(obj), npc: data.type === 'npc', srd };
  const { sys, items, npc } = read;
  const classes = classesOf(items, srd, read.sys);
  const spells = spellsOf(items, srd);
  const gear = gearOf(npc ? items.filter((i) => i.type !== 'weapon') : items, srd);
  const features = featuresOf(items, srd, classes.srd);
  const stats = statsOf(read, classes, spells.spells);
  const own = {
    ...opt('items', gear.own.length > 0 && gear.own),
    ...opt('spells', spells.own.length > 0 && spells.own),
    ...opt('features', features.length > 0 && features),
  };
  return {
    sheet: {
      ...bodyOf(sys),
      ...woundsOf(sys),
      stats,
      ...opt('inventory', gear.inventory.length > 0 && gear.inventory),
      ...opt('own', Object.keys(own).length > 0 && own),
    },
    skipped: classes.skipped,
  };
}

/** Converts the system data of a Foundry dnd5e actor. */
export function foundrySheet(data: unknown, ctx: FoundrySheetContext): ConvertedSheet {
  const actor = obj(data);
  const srd = srdFor(toEdition(ctx.rules));
  if (actor.type !== 'npc' && actor.type !== 'character')
    return {
      sheet: {},
      skipped: [{ what: 'Sheets of a kind we have no match for', count: 1, examples: [str(actor.type) ?? 'nameless'] }],
    };
  const monster = actor.type === 'npc' ? srd.monsters.get(slugify(str(actor.name) ?? '')) : undefined;
  const sys = obj(actor.system);
  const effects = foundryEffects(actor);
  const more: Sheet = {
    ...biographyOf(sys),
    ...stateOf(sys, actor.items),
    ...opt('effects', effects.effects.length > 0 && effects.effects),
    ...pileOf(actor),
  };
  if (monster) return { sheet: { monster: monster.id, ...woundsOf(sys), ...more }, skipped: effects.skipped };
  const built = builtSheet(actor, srd);
  return { sheet: { ...built.sheet, ...more }, skipped: [...built.skipped, ...effects.skipped] };
}

/** An Item Piles actor (flags["item-piles"]) is a pile of loot or a merchant. */
function pileOf(actor: Loose): Sheet {
  const data = obj(at(actor, 'flags.item-piles.data'));
  return opt(
    'pile',
    data.enabled === true && ({ kind: data.type === 'merchant' ? 'merchant' : 'loot' } as Sheet['pile']),
  );
}

/** The sheet's biography (HTML in Foundry) as text. */
function biographyOf(sys: Loose): Sheet {
  const html = str(at(sys, 'details.biography.value'));
  const text = html && paragraphs(html);
  return opt('biography', !!text && text);
}

/** An unlinked Foundry token's changes to its actor (`delta` from v11, `actorData` before) as ours. */
export function foundryDelta(delta: unknown): Sheet {
  const sys = obj(delta).system ?? obj(delta).data;
  const hp = num(at(sys, 'attributes.hp.value'));
  return opt('hp', hp !== undefined && Math.round(hp));
}

/** dnd5e 3+ asks each world whether it plays the "legacy" (2014) or "modern" (2024) rules. */
function rulesOf(setting: (key: string) => unknown): string | undefined {
  const editions: Record<string, string> = { modern: '2024', legacy: '2014' };
  const version = setting('dnd5e.rulesVersion');
  return typeof version === 'string' ? editions[version] : undefined;
}

/**
 * An item of the world's Items sidebar as a homebrew document: a spell or
 * gear the SRD has no match for by name (the SRD's are in the Compendium
 * already); undefined for those and for features, classes and the like.
 */
export function foundryHomebrew(raw: unknown, id: string, rules: string): Record<string, unknown> | undefined {
  const item = obj(raw);
  const name = str(item.name);
  const srd = srdFor(toEdition(rules));
  if (!name) return undefined;
  if (item.type === 'spell') return byName(srd.spells, name) ? undefined : { kind: 'spell', ...ownSpell(item, id) };
  if (!GEAR_TYPES.has(String(item.type)) || byName(srd.items, name)) return undefined;
  const { id: _id, name: _name, ...own } = ownItem(id, item);
  return { kind: 'item', id, name, item: own };
}

/** What the world import reads D&D actors with. */
export const foundrySheets: FoundrySheets = {
  system: 'dnd5e',
  rules: rulesOf,
  sheet: (actor, rules) => foundrySheet(actor, { rules }),
  delta: foundryDelta,
  homebrew: foundryHomebrew,
};
