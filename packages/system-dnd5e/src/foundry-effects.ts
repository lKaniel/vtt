import { freeId, type ImportLoss, slugify } from '@vtt/core';
import { at, list, type Loose, num, obj, opt, str } from './foundry-data.ts';
import { type EffectChange, EffectChangeSchema } from './effect-changes.ts';
import { ABILITIES } from './stats-schema.ts';
import { ConditionSchema, type Effect } from './spell-schema.ts';

// Foundry's Active Effects on a dnd5e actor as effects on our sheet: the
// actor's own (a condition, a lasting spell) and those its items give their
// bearer (a race's resistance, a ring's +1 AC while it is worn). Changes are
// matched by key to ours (effect-changes.ts); the rest, mostly modules'
// automation (Midi-QOL, DAE), is reported. Item effects that land on a
// target when the item is used stay with Foundry.

const KEYS: Record<string, EffectChange['key']> = {
  'system.attributes.prof': 'proficiency',
  'system.attributes.ac.bonus': 'ac',
  'system.attributes.hp.max': 'maxHp',
  'system.attributes.hp.bonuses.overall': 'maxHp',
  'system.attributes.movement.walk': 'speed',
  'system.attributes.init.bonus': 'initiative',
  'system.bonuses.abilities.save': 'saves.all',
  'system.traits.dr.value': 'resistances',
  'system.traits.di.value': 'immunities',
  'system.traits.dv.value': 'vulnerabilities',
  ...Object.fromEntries(ABILITIES.map((a) => [`system.abilities.${a}.value`, `abilities.${a}`])),
  ...Object.fromEntries(ABILITIES.map((a) => [`system.abilities.${a}.bonuses.save`, `saves.${a}`])),
};

/** Foundry's numbered modes before v14: custom, multiply, add, downgrade, upgrade, override. */
const MODES = ['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override'];

/** "+1" is 1, "@abilities.cha.mod" is "@cha"; damage types stay as they are. */
function valueOf(raw: unknown): EffectChange['value'] {
  const text = typeof raw === 'number' ? String(raw) : (str(raw) ?? '').trim();
  const n = num(text.replace(/^\+/, ''));
  return n ?? text.replace(/@abilities\.(\w+)\.mod/g, '@$1');
}

function changeOf(raw: Loose): EffectChange | undefined {
  const key = KEYS[str(raw.key) ?? ''];
  const mode = str(raw.type) ?? MODES[num(raw.mode) ?? 2];
  if (!key) return undefined;
  return EffectChangeSchema.safeParse({ key, mode, value: valueOf(raw.value) }).data;
}

/** An item's effects reach its bearer only while it is in use: equipped (and attuned when it must be). */
function inUse(item: Loose): boolean {
  const sys = obj(item.system);
  if (!['weapon', 'equipment', 'consumable', 'tool', 'loot', 'container'].includes(String(item.type))) return true;
  const needs = sys.attunement === 'required' || sys.attunement === 1;
  return sys.equipped === true && (!needs || sys.attuned === true || sys.attunement === 2);
}

interface Found {
  effects: Effect[];
  unmatched: string[];
  onUse: string[];
}

const changesOf = (e: Loose) => list(e.changes ?? at(e, 'system.changes')).map(obj);

function add(found: Found, e: Loose) {
  if (e.disabled === true) return;
  const raw = changesOf(e);
  const changes = raw.flatMap((c) => changeOf(c) ?? []);
  for (const c of raw) if (!changeOf(c)) found.unmatched.push(str(c.key) ?? '?');
  const conditions = list(e.statuses).flatMap((s) => ConditionSchema.safeParse(s).data ?? []);
  if (!changes.length && !conditions.length) return;
  const name = str(e.name) ?? 'Effect';
  const id = freeId(slugify(name) || 'effect', (x) => found.effects.some((f) => f.id === x), { bare: true });
  const effect: Effect = {
    id,
    name,
    ...opt('changes', changes.length > 0 && changes),
    ...opt('conditions', conditions.length > 0 && conditions),
  };
  found.effects.push(effect);
}

function lossesOf(found: Found): ImportLoss[] {
  const keys = [...new Set(found.unmatched)];
  return [
    ...(keys.length
      ? [
          {
            what: 'Active effect changes we have no match for (Foundry automation)',
            count: found.unmatched.length,
            examples: keys,
          },
        ]
      : []),
    ...(found.onUse.length
      ? [
          {
            what: 'Item effects that land on a target when used (the effect stays with Foundry)',
            count: found.onUse.length,
            examples: [...new Set(found.onUse)],
          },
        ]
      : []),
  ];
}

/** The effects on a Foundry actor (its own, and its items' on their bearer) as ours. */
export function foundryEffects(actor: unknown): { effects: Effect[]; skipped: ImportLoss[] } {
  const a = obj(actor);
  const found: Found = { effects: [], unmatched: [], onUse: [] };
  for (const e of list(a.effects).map(obj)) add(found, e);
  for (const item of list(a.items).map(obj)) {
    for (const e of list(item.effects).map(obj)) {
      if (e.transfer === false) found.onUse.push(str(e.name) ?? '?');
      else if (inUse(item)) add(found, e);
    }
  }
  return { effects: found.effects, skipped: lossesOf(found) };
}
