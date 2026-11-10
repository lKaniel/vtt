import { describe, expect, it } from 'vitest';
import classAutomation from '../content/srd/class-automation.json' with { type: 'json' };
import { FeatureSchema, SpellSchema, SubclassSchema } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Automation written for a pack's subclasses and class features is only
// read once a pack brings them, so nothing else would notice a field the
// schemas don't know (and drop without a word).

interface FeatureAuto {
  spell?: object;
  spellAt?: [number, object][];
}
interface Part {
  subclasses?: Record<string, Record<string, unknown>>;
  packFeatures?: Record<string, object>;
}
const classes = Object.entries(classAutomation as unknown as Record<string, Record<string, Part> | string>).filter(
  (e): e is [string, Record<string, Part>] => typeof e[1] !== 'string',
);
const PARTS: ('both' | Edition)[] = ['both', '2014', '2024'];

/** The paths in `given` that `kept` lacks: fields a schema dropped. */
function dropped(given: unknown, kept: unknown, at = ''): string[] {
  if (Array.isArray(given))
    return given.flatMap((g, i) => dropped(g, (kept as unknown[] | undefined)?.[i], `${at}[${i}]`));
  if (!given || typeof given !== 'object') return [];
  const out = (kept ?? {}) as Record<string, unknown>;
  return Object.entries(given).flatMap(([k, v]) =>
    v === null || k in out ? dropped(v, out[k], `${at}.${k}`) : [`${at}.${k}`],
  );
}

type Parsed =
  { success: true; data: unknown } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

/** What a parse refused or dropped of `given`. */
const problems = (parsed: Parsed, given: unknown): string[] =>
  parsed.success
    ? dropped(given, parsed.data)
    : parsed.error.issues.map((i) => `.${i.path.map(String).join('.')}: ${i.message}`);

const shell = { name: 'x', level: 1 };
const spellShell = { id: 'x', name: 'x', level: 0, school: 'feature', castingTime: 'action', range: 0 };

/** What SpellSchema refuses or drops of a feature's `spell`, at each level it changes (`spellAt`), its die a d6. */
function spellProblems(f: FeatureAuto): string[] {
  if (!f.spell) return [];
  const steps = [f.spell, ...(f.spellAt ?? []).map(([, set]) => ({ ...f.spell, ...set }))];
  return steps.flatMap((step) => {
    const given = JSON.parse(JSON.stringify({ ...spellShell, ...step }).replace(/\{die\}/g, '6')) as object;
    return problems(SpellSchema.safeParse(given), given).map((p) => `.spell${p}`);
  });
}

/** Everything a feature's automation names that its schemas refuse or drop. */
const featureProblems = (id: string, f: FeatureAuto): string[] => {
  const given = { id, ...shell, ...f };
  return [...problems(FeatureSchema.safeParse(given), given), ...spellProblems(f)];
};

function droppedOf(cls: string, part: Part): string[] {
  const subs = Object.entries(part.subclasses ?? {}).flatMap(([id, sub]) => {
    const features = Object.entries((sub.features ?? {}) as Record<string, FeatureAuto>).map(([fid, f]) => ({
      id: fid,
      ...shell,
      ...f,
    }));
    const given = { ...sub, id, name: 'x', features };
    const spells = features.flatMap((f) => spellProblems(f).map((p) => `.${f.id}${p}`));
    return [...problems(SubclassSchema.safeParse(given), given), ...spells].map((p) => `${cls} ${id}${p}`);
  });
  const feats = Object.entries(part.packFeatures ?? {}).flatMap(([id, f]) =>
    featureProblems(id, f).map((p) => `${cls} ${id}${p}`),
  );
  return [...subs, ...feats];
}

describe('pack automation in class-automation.json', () => {
  it('names only fields the class schemas know', () => {
    const lost = classes.flatMap(([cls, parts]) => PARTS.flatMap((p) => (parts[p] ? droppedOf(cls, parts[p]) : [])));
    expect(lost).toEqual([]);
  });

  it('gives every pack feature an action, a passive or a note for the GM', () => {
    const silent = classes.flatMap(([cls, parts]) =>
      Object.entries(parts.both?.packFeatures ?? {})
        .filter(([, f]) => !('action' in f || 'passive' in f || 'manual' in f))
        .map(([id]) => `${cls} ${id}`),
    );
    expect(silent).toEqual([]);
  });
});
