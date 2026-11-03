import { at, list, type Loose, num, obj, opt, plainText, str } from './foundry-data.ts';
import { DamageTypeSchema } from './stats-schema.ts';
import { type CastingTime, type Spell, SpellSchema } from './spell-schema.ts';
import type { z } from 'zod';

// A Foundry dnd5e spell the SRD has no match for, as a spell of the sheet's
// own: its level, school, casting time, range and duration, and from its
// activities (dnd5e 4+) the attack or save and the damage it rolls. A spell
// that does nothing we can read comes as text the GM applies by hand.

type SpellInput = z.input<typeof SpellSchema>;

const SCHOOLS: Record<string, string> = {
  abj: 'abjuration',
  con: 'conjuration',
  div: 'divination',
  enc: 'enchantment',
  evo: 'evocation',
  ill: 'illusion',
  nec: 'necromancy',
  trs: 'transmutation',
};
const CASTING: readonly CastingTime[] = ['action', 'bonus', 'reaction', 'minute', 'hour'];
const UNITS: Record<string, string> = { round: 'round', turn: 'turn', minute: 'minute', hour: 'hour', day: 'day' };

const castingOf = (sys: Loose): CastingTime => {
  const type = str(at(sys, 'activation.type'));
  return CASTING.find((c) => c === type) ?? 'action';
};

function rangeOf(sys: Loose): number {
  const units = str(at(sys, 'range.units'));
  const value = num(at(sys, 'range.value')) ?? 0;
  if (units === 'ft') return value;
  if (units === 'mi') return value * 5280;
  return units === 'touch' ? 5 : 0;
}

function durationOf(sys: Loose): string {
  const units = str(at(sys, 'duration.units')) ?? 'inst';
  const value = num(at(sys, 'duration.value'));
  if (units === 'perm') return 'Until dispelled';
  const unit = UNITS[units];
  if (!unit) return 'Instantaneous';
  const n = value ?? 1;
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** "2d6[necrotic]" is 2d6; number and denomination are 1d10, with a flat bonus kept. */
function diceOf(part: Loose): string | undefined {
  const custom = obj(part.custom);
  if (custom.enabled === true) return str(str(custom.formula)?.split('[')[0]?.trim());
  const [n, d] = [num(part.number), num(part.denomination)];
  if (!n || !d) return undefined;
  const bonus = num(part.bonus) ?? 0;
  if (!bonus) return `${n}d${d}`;
  return `${n}d${d}${bonus > 0 ? '+' : ''}${bonus}`;
}

const partsOf = (activity: Loose) => list(at(activity, 'damage.parts')).map(obj);

function damageOf(activity: Loose): Spell['damage'] {
  return partsOf(activity).flatMap((part) => {
    const dice = diceOf(part);
    const type = DamageTypeSchema.safeParse(list(part.types)[0]).data;
    return dice && type ? [{ dice, type }] : [];
  });
}

function upcastOf(activity: Loose): Partial<SpellInput> {
  const scaling = obj(partsOf(activity)[0]?.scaling);
  const formula = str(scaling.formula);
  return opt('upcast', scaling.mode === 'whole' && !!formula && { damage: formula });
}

function attackOf(activity: Loose): Partial<SpellInput> {
  const kind = str(at(activity, 'attack.type.value')) ?? str(at(activity, 'attack.value'));
  const attack = (['melee', 'ranged'] as const).find((k) => k === kind);
  return opt('attack', attack);
}

function saveOf(activity: Loose): Partial<SpellInput> {
  const raw = at(activity, 'save.ability');
  const ability = str(list(raw)[0]) ?? str(raw);
  const onSave = str(at(activity, 'damage.onSave')) === 'half' ? 'half' : 'none';
  return opt('save', !!ability && ({ ability, onSave } as SpellInput['save']));
}

/** What its first activity that does something rolls. */
function doesOf(sys: Loose): Partial<SpellInput> {
  const activities = Object.values(obj(sys.activities)).map(obj);
  const act = activities.find((a) => ['attack', 'save', 'damage', 'heal'].includes(String(a.type)));
  if (!act) return {};
  if (act.type === 'heal') return opt('heal', diceOf(obj(act.healing)));
  const damage = damageOf(act);
  return {
    ...attackOf(act),
    ...(act.type === 'save' ? saveOf(act) : {}),
    damage,
    ...(damage.length ? upcastOf(act) : {}),
  };
}

/** A Foundry spell item as a spell of its own, with the id `id`. */
export function ownSpell(item: unknown, id: string): Spell {
  const it = obj(item);
  const sys = obj(it.system);
  const properties = list(sys.properties);
  const base = {
    id,
    name: str(it.name) ?? 'Spell',
    level: Math.min(9, Math.max(0, Math.round(num(sys.level) ?? 0))),
    school: SCHOOLS[str(sys.school) ?? ''] ?? str(sys.school) ?? '',
    castingTime: castingOf(sys),
    range: rangeOf(sys),
    duration: durationOf(sys),
    ritual: properties.includes('ritual'),
    concentration: properties.includes('concentration'),
    description: plainText(str(at(sys, 'description.value')) ?? ''),
  };
  const does = doesOf(sys);
  const automated = !!(does.attack ?? does.save ?? does.heal ?? does.damage?.length);
  const read = SpellSchema.safeParse({ ...base, ...does, automated });
  return read.success ? read.data : SpellSchema.parse({ ...base, automated: false });
}
