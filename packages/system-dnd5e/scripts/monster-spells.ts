// A monster's spellcasting: the stat block's ability, save DC and slots, the
// spells it has prepared, and the spells it casts at will or so many times a
// day, which become features that pay for the cast instead of a slot.

import { bare, num, str, type Entry, type Pack } from './srd-convert.ts';

interface Listed {
  spell: string;
  /** The level it is cast at when the block names one ("level 4 version"). */
  level?: number;
  /** Casts a day; missing: at will. */
  uses?: number;
}

interface Casting {
  spellcasting?: Record<string, unknown>;
  features?: Record<string, unknown>[];
}

const idOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** "At will" or "2/Day Each" at the head of a line, after its emphasis marks or bullet. */
const GROUP = /^(at will|(\d)\/day(?: each)?)$/i;
/** A spell's name in emphasis, and the note in brackets after it. */
const NAMED = /\*([^*]+)\*(?: \(([^)]*)\))?/g;

/** The spells a line lists, those the rules hold. */
function lineSpells(pack: Pack, line: string): Listed[] {
  const colon = line.indexOf(':');
  const group = GROUP.exec(line.slice(0, Math.max(0, colon)).replace(/^[-*\s]+/, ''));
  if (!group) return [];
  const uses = group[2] ? Number(group[2]) : undefined;
  // The colon may sit inside the emphasis ("*At Will:* ..."): its closing mark is not a spell's.
  const rest = line.slice(colon + 1).replace(/^\*/, '');
  return [...rest.matchAll(NAMED)].flatMap((m) => {
    const spell = idOf(m[1]!);
    if (!pack.entries.has(`spells.${spell}`)) return [];
    const level = /level (\d)/i.exec(m[2] ?? '')?.[1];
    return [{ spell, ...(level && { level: Number(level) }), ...(uses && { uses }) }];
  });
}

function slotsOf(entry: Entry): number[] {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => num(entry.fields?.[`slots${level}`]) ?? 0);
  return all.slice(0, all.findLastIndex((n) => n > 0) + 1);
}

const nameOf = (pack: Pack, spell: string) => pack.text[`spells.${spell}.name`] ?? spell;
const atLevel = (l: Listed) => (l.level ? `, at level ${l.level}` : '');
const freeCast = ({ spell, level }: Listed) => ({ spell, ...(level && { level }) });

function features(pack: Pack, listed: readonly Listed[]): Record<string, unknown>[] {
  const atWill = listed.filter((l) => !l.uses);
  const daily = listed.filter((l) => l.uses);
  const free = {
    id: 'at-will',
    name: 'Spells at will',
    level: 1,
    description: `Cast at will, with no spell slot: ${atWill.map((l) => nameOf(pack, l.spell)).join(', ')}.`,
    freeCasts: atWill.map(freeCast),
  };
  return [
    ...(atWill.length ? [free] : []),
    ...daily.map((l) => ({
      id: `daily-${l.spell}`,
      name: `${nameOf(pack, l.spell)} (${l.uses}/Day)`,
      level: 1,
      description: `Cast ${l.uses} times a day with no spell slot${atLevel(l)}.`,
      uses: [[1, l.uses]],
      freeCasts: [freeCast(l)],
    })),
  ];
}

/** Drops the keys with nothing in them, to keep the files small. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** The spellcasting of the monster with entries `refs`: the caster it is, and the features that cast for free. */
export function monsterSpells(pack: Pack, refs: readonly string[]): Casting {
  const entries = refs
    .map((ref) => pack.entries.get(ref))
    .filter((e): e is Entry => !!e?.fields?.spellAbility)
    .sort((a, b) => slotsOf(b).length - slotsOf(a).length);
  const lead = entries[0];
  if (!lead?.fields) return {};
  const slots = slotsOf(lead);
  const prepared = entries.flatMap((e) => (e.fields?.innate ? [] : (e.grants ?? []).map((g) => bare(g.item))));
  const listed = entries.flatMap((e) =>
    (pack.text[`${e.id}.description`] ?? '').split(/\n+/).flatMap((line) => lineSpells(pack, line)),
  );
  const spells = [...new Set([...prepared, ...listed.map((l) => l.spell)])];
  if (!spells.length) return {};
  const cast = features(pack, listed);
  return {
    spellcasting: compact({
      ability: str(lead.fields.spellAbility),
      dc: num(lead.fields.spellDc),
      attack: num(lead.fields.spellAttack),
      level: num(lead.fields.casterLevel),
      slots: slots.length ? slots : undefined,
      spells,
    }),
    ...(cast.length > 0 && { features: cast }),
  };
}
