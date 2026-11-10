// What a monster's stat block holds besides its attacks: Multiattack, traits,
// actions behind a saving throw (breath weapons), skills, languages and speeds.

import { monsterSpells } from './monster-spells.ts';
import { bare, damage, formula, list, num, str, type Entry, type Fields, type Pack } from './srd-convert.ts';

interface Trait {
  name: string;
  description: string;
  kind?: string;
}

interface Extras {
  multiattack?: number;
  traits?: Trait[];
  features?: Record<string, unknown>[];
  spellcasting?: Record<string, unknown>;
  alignment?: string;
  skills?: string[];
  expertise?: string[];
  languages?: string[];
  speeds?: Record<string, number | boolean>;
}

const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const NUMBER = Object.keys(COUNT).join('|');
const titled = (id: string) => id.replace(/-/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
/** The entry's name without its uses in brackets: "Enslave (3/Day)" is Enslave. */
const nameOf = (pack: Pack, ref: string) =>
  (pack.text[`${ref}.name`] ?? ref.split('.').at(-1)!).replace(/ \((?:\d+\/Day[^)]*|Recharge[^)]*)\)$/i, '');
const textOf = (pack: Pack, ref: string) => pack.text[`${ref}.description`] ?? '';

/** The pack's kind of entry: 5.1 leaves it out for actions and calls bonus actions "bonus-action". */
function kindOf(f: Fields): string {
  const kind = str(f.kind) ?? 'action';
  return kind === 'bonus-action' ? 'bonus' : kind;
}

// ---- Multiattack ----------------------------------------------------------

/** Where a Multiattack sentence turns to what it may do instead, or to how its attacks are split. */
const ASIDE = new RegExp(
  `:|—|, only\\b|\\balternatively\\b|,? or (?:it |the \\w+ )?(?:makes |uses )?(?:${NUMBER})\\b`,
  'i',
);
/** A number and the "attacks" it counts, with no other number between them. */
const ATTACKS = new RegExp(`\\b(${NUMBER})\\b(?:(?!\\b(?:${NUMBER})\\b)[^.])*?\\battacks?\\b`, 'gi');

/** The attacks a sentence of Multiattack adds up to: "two Claw attacks and one Sting attack" is three. */
function attacksIn(sentence: string): number {
  const said = sentence.split(ASIDE)[0] ?? '';
  return [...said.matchAll(ATTACKS)].reduce((n, m) => n + (COUNT[m[1]!.toLowerCase()] ?? 0), 0);
}

/** Attacks per Multiattack, as its words count them; else its scripted attack steps (a hydra's heads), five at most. */
function multiattack(pack: Pack, refs: readonly string[]): number | undefined {
  const ref = refs.find((r) => r.endsWith('.multiattack'));
  const entry = ref && (pack.entries.get(ref) as { actions?: { steps?: { use?: string }[] }[] } | undefined);
  if (!ref || !entry) return undefined;
  const said = textOf(pack, ref)
    .split(/\.\s/)
    .map(attacksIn)
    .find((n) => n > 0);
  if (said) return said;
  const steps = (entry.actions ?? []).flatMap((a) => a.steps ?? []).filter((s) => s.use === 'monster-attack');
  return steps.length ? Math.min(5, steps.length) : undefined;
}

// ---- Actions behind a save --------------------------------------------------

const AREA: Record<string, string> = { cylinder: 'sphere' };

function area(f: Fields): object | undefined {
  const shape = str(f.areaShape);
  const size = num(f.areaSize);
  if (!shape || !size) return undefined;
  const width = num(f.areaWidth);
  return { shape: AREA[shape] ?? shape, size, ...(width && { width }) };
}

/** Damage a failed save takes: 5.1 writes `saveDamage`, 5.2 the action's own `damage`. */
function saveDamage(f: Fields): object[] {
  const out: object[] = [];
  const add = (dice: unknown, type: unknown) => {
    if (dice && type) out.push({ dice: formula(dice), type });
  };
  add(f.saveDamage, f.saveDamageType);
  add(f.damage, f.damageType);
  add(f.damage2, f.damage2Type);
  return out;
}

function conditions(f: Fields): string[] {
  return [...list(f.conditions), ...(str(f.condition) ? [str(f.condition)!] : [])].map(bare);
}

/** How long a condition lasts, read from the words: a minute (also when it repeats its save), an hour, a day, else until the bearer's next turn ends. */
function rounds(text: string): number {
  if (/for 1 hour/i.test(text)) return 600;
  if (/for 24 hours|until (?:it|the \w+) dies/i.test(text)) return 14400;
  return /for 1 minute|repeat/i.test(text) ? 10 : 1;
}

/** Whom an action without an area reaches: everyone the words say within so many feet, else one creature. */
function reach(text: string): { targets: number; range: number } {
  const feet = Number(/within (\d+) feet/i.exec(text)?.[1] ?? /\b(\d+) feet/i.exec(text)?.[1] ?? 30);
  return { targets: /\beach (creature|enemy|target)/i.test(text) ? 20 : 1, range: feet };
}

function saveSpell(f: Fields, text: string): object {
  const zone = area(f);
  const held = conditions(f);
  const emanation = (zone as { shape?: string } | undefined)?.shape === 'emanation';
  const aim = zone ? { targets: 1, range: emanation || !/\bpoint\b/i.test(text) ? 0 : reach(text).range } : reach(text);
  return {
    ...aim,
    ...(zone && { area: zone }),
    ...(held.length > 0 && { rounds: rounds(text) }),
    save: { ability: f.save, dc: f.saveDc, onSave: f.saveEffect === 'half' ? 'half' : 'none' },
    damage: saveDamage(f),
    ...(held.length > 0 && {
      effect: { conditions: held, ...(/repeat/i.test(text) && { repeatSave: true }) },
    }),
  };
}

/** Uses before they come back: so many a day, or one that recharges on a d6. */
function uses(f: Fields): object {
  const perDay = num(f.perDay);
  const recharge = num(f.recharge);
  if (recharge) return { uses: [[1, 1]], rechargeOn: recharge };
  return perDay ? { uses: [[1, perDay]] } : {};
}

const runs = (f: Fields) => !f.attack && !!f.save && !!f.saveDc && ['action', 'bonus'].includes(kindOf(f));

function feature(pack: Pack, ref: string, f: Fields): Record<string, unknown> {
  const text = textOf(pack, ref);
  return {
    id: ref.split('.').at(-1)!,
    name: nameOf(pack, ref),
    level: 1,
    description: text,
    action: kindOf(f),
    ...uses(f),
    spell: saveSpell(f, text),
  };
}

// ---- Text -------------------------------------------------------------------

/** Entries shown as text: not attacks, single spells (Spellcasting lists them), legendary options, Multiattack, or what the engine runs. */
function isText(ref: string, f: Fields): boolean {
  if (f.attack || f.spell || kindOf(f) === 'legendary' || runs(f)) return false;
  return !ref.endsWith('.multiattack') && !ref.endsWith('.legendary-resistance');
}

function trait(pack: Pack, ref: string, f: Fields): Trait {
  const kind = kindOf(f);
  return { name: nameOf(pack, ref), description: textOf(pack, ref), ...(kind !== 'trait' && { kind }) };
}

// ---- The stat block's own lines ------------------------------------------------

function speeds(f: Fields): Record<string, number | boolean> | undefined {
  const out: Record<string, number | boolean> = {};
  for (const kind of ['fly', 'swim', 'climb', 'burrow']) {
    const feet = num(f[`${kind}Speed`]);
    if (feet) out[kind] = feet;
  }
  if (f.hover === true) out.hover = true;
  return Object.keys(out).length ? out : undefined;
}

function languages(f: Fields): string[] | undefined {
  const spoken = list(f.languages).map((l) => titled(bare(l)));
  const telepathy = num(f.telepathy);
  const all = [...spoken, ...(telepathy ? [`telepathy ${telepathy} ft.`] : [])];
  return all.length ? all : undefined;
}

const some = <T>(items: T[]): T[] | undefined => (items.length ? items : undefined);

/** Drops the keys with nothing in them, to keep the files small. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Everything beyond attacks and legendary actions that the monster `f` with entries `refs` has. */
export function monsterExtras(pack: Pack, f: Fields, refs: readonly string[]): Extras {
  const entries = [...new Set(refs)]
    .flatMap((ref) => {
      const fields = pack.entries.get(ref)?.fields;
      return fields ? [{ ref, fields }] : [];
    })
    .sort((a, b) => (num(a.fields.order) ?? 0) - (num(b.fields.order) ?? 0));
  const magic = monsterSpells(pack, refs);
  const run = entries.filter((e) => runs(e.fields)).map((e) => feature(pack, e.ref, e.fields));
  return compact({
    multiattack: multiattack(pack, refs),
    traits: some(entries.filter((e) => isText(e.ref, e.fields)).map((e) => trait(pack, e.ref, e.fields))),
    features: some([...run, ...(magic.features ?? [])]),
    spellcasting: magic.spellcasting,
    alignment: str(f.alignment)?.replace(/-/g, ' '),
    skills: some(list(f.skills).map(bare)),
    expertise: some(list(f.expertise).map(bare)),
    languages: languages(f),
    speeds: speeds(f),
  });
}

// ---- Numbers, attacks and legendary actions -----------------------------------

const SIZE: Record<string, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function riderDamage(f: Fields): object[] {
  return f.saveDamage && f.saveDamageType ? [{ dice: formula(f.saveDamage), type: f.saveDamageType }] : [];
}

/** How long a condition from a hit lasts: as the words say, else until something ends it (prone, grappled). */
function riderRounds(text: string): number | undefined {
  if (/until the (?:end|start) of/i.test(text)) return 1;
  return /for 1 (?:minute|hour)|for 24 hours|repeat/i.test(text) ? rounds(text) : undefined;
}

/** "escape DC 14" in the words, for packs that leave the field out (5.1). */
function escapeDc(text: string): number | undefined {
  const dc = /escape DC (\d+)/i.exec(text)?.[1];
  return dc ? Number(dc) : undefined;
}

/** What rides on a hit: extra damage or conditions behind a saving throw, or conditions a hit simply leaves. */
function onHit(f: Fields, text: string): object | undefined {
  const held = conditions(f);
  const extra = riderDamage(f);
  if (!held.length && !extra.length) return undefined;
  const save = f.save && f.saveDc ? { ability: f.save, dc: f.saveDc } : undefined;
  return compact({
    save,
    damage: some(extra),
    half: f.saveEffect === 'half' || undefined,
    conditions: some(held),
    rounds: held.length ? riderRounds(text) : undefined,
    repeatSave: (!!save && held.length > 0 && /repeat/i.test(text)) || undefined,
    maxSize: SIZE[str(f.maxSize) ?? ''],
    escape: num(f.escapeDc) ?? escapeDc(text),
  });
}

/** A monster's attack actions. Thrown weapons give a melee and a ranged attack. */
function monsterAttacks(pack: Pack, ref: string): object[] {
  const f = pack.entries.get(ref)?.fields;
  if (!f?.attack || !f.damage) return [];
  const name = pack.text[`${ref}.name`] ?? ref.split('.').at(-1)!;
  const rider = onHit(f, textOf(pack, ref));
  const base = { toHit: f.toHit, damage: damage(f), ...(rider && { onHit: rider }) };
  const melee = f.attack === 'melee' ? [{ name, kind: 'melee', ...base, reach: Math.max(5, num(f.reach) ?? 5) }] : [];
  const normal = num(f.normalRange);
  if (!normal) return melee;
  const thrown = melee.length ? `${name} (thrown)` : name;
  return [...melee, { name: thrown, kind: 'ranged', ...base, range: [normal, num(f.longRange) ?? normal] }];
}

const WEAPON_DAMAGE = ['bludgeoning', 'piercing', 'slashing'];
/** Damage defenses we can't tell apart yet: every weapon is nonmagical, and spell damage isn't a type. */
const DEFENSE: Record<string, string[]> = {
  nonmagical: WEAPON_DAMAGE,
  'nonmagical-not-adamantine': WEAPON_DAMAGE,
  'nonmagical-unsilvered': WEAPON_DAMAGE,
  'piercing-slashing-not-adamantine': ['piercing', 'slashing'],
  'piercing-magic-weapon-by-good': [],
  spell: [],
};

function damageDefense(f: Fields, key: string): string[] {
  const types = list(f[key]).flatMap((t) => DEFENSE[bare(t)] ?? [bare(t)]);
  return [...new Set(types)];
}

/** Blindsight, tremorsense and truesight, only when the monster has them, to keep the files small. */
function otherSenses(f: Fields): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sense of ['blindsight', 'tremorsense', 'truesight']) {
    const range = num(f[sense]);
    if (range) out[sense] = range;
  }
  return out;
}

/** The attack a legendary action makes (a dragon's tail attack), by the attack's name. */
function legendaryAttack(pack: Pack, action: Entry): string | undefined {
  const scripted = action as Entry & { actions?: { steps?: { use?: string; source?: string }[] }[] };
  const steps = (scripted.actions ?? []).flatMap((a) => a.steps ?? []);
  const source = steps.find((s) => s.use === 'monster-attack')?.source?.replace(/'/g, '');
  return source ? (pack.text[`${source}.name`] ?? source.split('.').at(-1)) : undefined;
}

const ABILITY: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha',
};
const WORD_CONDITIONS =
  /(?:or (?:be|become) |knocked )(blinded|charmed|deafened|frightened|paralyzed|poisoned|prone|restrained|stunned)/i;

/** Where the words aim: everyone around the monster (an emanation), or what the words say. */
function wordsArea(text: string): Fields {
  const around = /\beach\b[^.]*within (\d+) feet of (?:the|it)\b/i.exec(text) ?? /in a (\d+)-foot radius/i.exec(text);
  return around ? { areaShape: 'emanation', areaSize: Number(around[1]) } : {};
}

/** A 2014 legendary action behind a save, read from its words (the 5.1 pack gives it no fields). */
function wordsFields(text: string): Fields | undefined {
  const save = /DC (\d+) (\w+) saving throw/i.exec(text);
  const ability = save && ABILITY[save[2]!.toLowerCase()];
  if (!ability || /ends its turn/i.test(text)) return undefined;
  const hurt = /\(([\dd +]+)\) (\w+) damage/i.exec(text);
  const held = WORD_CONDITIONS.exec(text)?.[1]?.toLowerCase();
  return {
    save: ability,
    saveDc: Number(save[1]),
    ...(hurt && { damage: hurt[1], damageType: hurt[2]!.toLowerCase() }),
    ...(/half as much damage/i.test(text) && { saveEffect: 'half' }),
    ...(held && { conditions: [`conditions.${held}`] }),
    ...wordsArea(text),
  };
}

/** A legendary action that is a save action, run like a breath weapon: from the fields, else the words. */
function legendarySpell(f: Fields, text: string): object | undefined {
  if (f.spell) return undefined;
  const fields = f.save && f.saveDc ? f : wordsFields(text);
  return fields && (fields.damage || conditions(fields).length) ? saveSpell(fields, text) : undefined;
}

function legendaryOption(pack: Pack, ref: string): object | undefined {
  const action = pack.entries.get(ref);
  if (action?.fields?.kind !== 'legendary') return undefined;
  const name = (pack.text[`${ref}.name`] ?? bare(ref)).replace(/ ?\(Costs? \d+ Actions?\)/i, '');
  const description = pack.text[`${ref}.description`];
  const attack = legendaryAttack(pack, action);
  const spell = attack ? undefined : legendarySpell(action.fields, description ?? '');
  return {
    id: ref.split('.').at(-1),
    name,
    cost: num(action.fields.legendaryCost) ?? 1,
    ...(attack && { attack }),
    ...(spell && { spell }),
    ...(description && { description }),
  };
}

/** Legendary actions per round and their options, and legendary resistance per day. */
function legendaryParts(pack: Pack, f: Fields, refs: readonly string[]): object {
  const actions = num(f.legendaryActions);
  const options = refs.flatMap((r) => legendaryOption(pack, r) ?? []);
  const resist = refs.map((r) => pack.entries.get(r)).find((e) => e?.id.endsWith('.legendary-resistance'));
  const perDay = num(resist?.fields?.perDay);
  return {
    ...(actions && options.length && { legendary: { actions, options } }),
    ...(perDay && { legendaryResistance: perDay }),
  };
}

export function convertMonster(pack: Pack, m: Entry): object {
  const f = m.fields ?? {};
  const refs = [...(m.grants ?? []).map((g) => g.item), ...list(f.entries)];
  const defense = (k: string) => list(f[k]).map(bare);
  return {
    id: bare(m.id),
    name: pack.text[`${m.id}.name`] ?? bare(m.id),
    size: SIZE[str(f.size) ?? 'medium'] ?? 1,
    type: f.creatureType,
    ac: f.ac,
    hp: f.hp,
    speed: num(f.speed) ?? 30,
    darkvision: num(f.darkvision) ?? 0,
    ...otherSenses(f),
    abilities: { str: f.str, dex: f.dex, con: f.con, int: f.int, wis: f.wis, cha: f.cha },
    cr: f.cr,
    saves: defense('saves'),
    attacks: refs.flatMap((r) => monsterAttacks(pack, r)),
    resistances: damageDefense(f, 'damageResistances'),
    immunities: damageDefense(f, 'damageImmunities'),
    vulnerabilities: damageDefense(f, 'damageVulnerabilities'),
    conditionImmunities: defense('conditionImmunities'),
    ...legendaryParts(pack, f, [...refs, ...list(f.ownCopies)]),
    ...monsterExtras(pack, f, refs),
  };
}
