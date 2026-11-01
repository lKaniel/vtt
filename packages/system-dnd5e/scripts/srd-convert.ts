// Turns entries of the Open Character Format SRD packs into our content
// format. Pure functions, so they can be tested; scripts/import-srd.ts runs them.

type Fields = Record<string, unknown>;
export interface Entry {
  id: string;
  type: string;
  fields?: Fields;
  grants?: { item: string; when?: string }[];
  effects?: { target: unknown; op: string; value: unknown }[];
}
export interface Pack {
  entries: Map<string, Entry>;
  text: Record<string, string>;
}

const bare = (ref: string) => ref.slice(ref.indexOf('.') + 1);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const formula = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, '') : undefined;

export function ofType(pack: Pack, type: string): Entry[] {
  return [...pack.entries.values()].filter((e) => e.type === type);
}

// ---- Spells -------------------------------------------------------------

const ROUNDS_PER: Record<string, number> = { round: 1, minute: 10, hour: 600, day: 14400 };
const CASTING: Record<string, string> = { action: 'action', 'bonus-action': 'bonus', reaction: 'reaction' };
const AREA: Record<string, string> = { cylinder: 'sphere', sphere: 'sphere', emanation: 'emanation' };

function castingTime(v: string): string {
  return CASTING[v] ?? (v.includes('hour') ? 'hour' : 'minute');
}

function range(f: Fields): number {
  const kind = str(f.rangeKind);
  if (kind === 'self') return 0;
  if (kind === 'touch') return 5;
  return num(f.range) ?? 1000;
}

function duration(f: Fields): { rounds?: number; duration: string } {
  const unit = str(f.durationUnit) ?? 'instantaneous';
  const amount = num(f.durationAmount) ?? 1;
  const per = ROUNDS_PER[unit];
  if (!per) return { duration: unit.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) };
  const words = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
  return { rounds: amount * per, duration: f.concentration ? `Concentration, up to ${words}` : words };
}

function area(f: Fields, reach: number): object | undefined {
  const shape = str(f.areaShape);
  if (!shape) return undefined;
  const size = num(f.areaSize) ?? 5;
  // A sphere around yourself is an emanation.
  const mapped = shape === 'sphere' && reach === 0 ? 'emanation' : (AREA[shape] ?? shape);
  return { shape: mapped, size };
}

function damage(f: Fields): object[] {
  const out: object[] = [];
  if (f.damage && f.damageType) out.push({ dice: formula(f.damage), type: f.damageType });
  if (f.damage2 && f.damage2Type) out.push({ dice: formula(f.damage2), type: f.damage2Type });
  return out;
}

/** "8d6" and 1 become "1d6": the dice added per slot level. */
function perLevel(base: unknown, count: unknown): string | undefined {
  const n = num(count);
  const die = /d\d+/.exec(formula(base) ?? '')?.[0];
  return n && die ? `${n}${die}` : undefined;
}

function upcast(f: Fields): object | undefined {
  const out = {
    damage: perLevel(f.damage, f.upcastDice),
    heal: perLevel(f.heal, f.upcastHealDice),
    targets: f.upcastTargets ? 1 : undefined,
  };
  return Object.values(out).some((v) => v !== undefined) ? out : undefined;
}

function heal(f: Fields): string | undefined {
  if (!f.heal) return undefined;
  const bonus = num(f.healBonus);
  return bonus ? `${formula(f.heal)}+${bonus}` : formula(f.heal);
}

/** One pack effect as our effect fields: dice on rolls, AC, or advantage against the bearer. */
function effectField(e: { target: unknown; op: string; value: unknown }): Fields {
  const rolls = typeof e.target === 'object' ? ((e.target as { rolls?: string[] }).rolls ?? []) : [];
  if (e.op === 'add' && rolls.length) {
    const bonus = String(formula(e.value));
    return {
      ...(rolls.includes('attack') ? { attackBonus: bonus } : {}),
      ...(rolls.includes('save') ? { saveBonus: bonus } : {}),
    };
  }
  if (e.target === 'combat.ac' && e.op === 'add') return { ac: e.value };
  return e.target === 'combat.attackersAdvantage' ? { advantageAgainst: true } : {};
}

/** The few kinds of lasting effect the packs describe as data. */
function appliedEffect(spell: Entry): Fields {
  return Object.assign({}, ...(spell.effects ?? []).map(effectField)) as Fields;
}

function spellEffect(spell: Entry, f: Fields): object | undefined {
  const effect = appliedEffect(spell);
  const condition = str(f.condition);
  if (condition) effect.conditions = [bare(condition)];
  return Object.keys(effect).length ? effect : undefined;
}

export function convertSpell(pack: Pack, spell: Entry): object {
  const f = spell.fields ?? {};
  const key = bare(spell.id);
  const reach = range(f);
  const where = area(f, reach);
  const effect = spellEffect(spell, f);
  const save = str(f.save);
  const parts = damage(f);
  return {
    id: key,
    name: pack.text[`spells.${key}.name`] ?? key,
    level: f.level,
    school: f.school,
    classes: list(f.classes).map(bare),
    castingTime: castingTime(str(f.castingTime) ?? 'action'),
    range: reach,
    ritual: f.ritual === true,
    concentration: f.concentration === true,
    ...duration(f),
    targets: reach === 0 && !where ? 0 : 1,
    area: where,
    attack: f.attack,
    save: save ? { ability: save, onSave: f.saveEffect === 'half' ? 'half' : 'none' } : undefined,
    damage: parts,
    heal: heal(f),
    healMod: f.healAddsMod === true,
    upcast: upcast(f),
    cantrip: f.cantripScaling ? 'dice' : undefined,
    effect,
    automated: [f.attack, save, parts.length, f.heal, effect].some(Boolean),
    description: pack.text[`spells.${key}.description`] ?? '',
  };
}

// ---- Classes ------------------------------------------------------------

const level = (when?: string) => Number(/self\.level >= (\d+)/.exec(when ?? '')?.[1] ?? 1);

export function convertClass(pack: Pack, cls: Entry): object {
  const key = bare(cls.id);
  const saves = (cls.effects ?? [])
    .filter((e) => e.target === 'proficiencies.saves')
    .map((e) => bare((e.value as { tag: string }).tag));
  const features = (cls.grants ?? [])
    .filter((g) => !g.item.includes('ability-score-improvement'))
    .map((g) => {
      const id = g.item.split('.').at(-1)!;
      return {
        id,
        name: pack.text[`${g.item}.name`] ?? id,
        level: level(g.when),
        description: pack.text[`${g.item}.description`] ?? '',
      };
    })
    .sort((a, b) => a.level - b.level);
  return {
    id: key,
    name: pack.text[`classes.${key}.name`] ?? key,
    hitDie: Number(str(cls.fields?.hitDie)?.slice(2) ?? 8),
    saves,
    features,
  };
}

// ---- Monsters -----------------------------------------------------------

const SIZE: Record<string, number> = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };

function riderDamage(f: Fields): object[] {
  return f.saveDamage && f.saveDamageType ? [{ dice: formula(f.saveDamage), type: f.saveDamageType }] : [];
}

/** A monster's attack actions. Thrown weapons give a melee and a ranged attack. */
function monsterAttacks(pack: Pack, ref: string): object[] {
  const f = pack.entries.get(ref)?.fields;
  if (!f?.attack || !f.damage) return [];
  const name = pack.text[`${ref}.name`] ?? ref.split('.').at(-1)!;
  // Rider damage behind a save (a spider's poison) is counted as part of the hit.
  const base = { toHit: f.toHit, damage: [...damage(f), ...riderDamage(f)] };
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
  };
}
