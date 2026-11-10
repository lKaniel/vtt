import { roll, type Rng, type Roll } from '@vtt/shared';
import { critDice } from './attack.ts';
import { rollSave, type SaveRoll } from './effects.ts';
import type { CastSide } from './spells.ts';
import type { Effect } from './spell-schema.ts';
import type { Attack, DamageType, OnHit } from './stats-schema.ts';

// What rides on a monster's hit: a saving throw against extra damage (a
// spider's poison) or a condition (a ghoul's paralysis), or a condition that
// simply happens (a creature knocked prone).

export interface HitSaveInput {
  attacker: CastSide;
  target: CastSide;
  attack: Attack;
  /** The hit was a critical: the extra dice are doubled too. */
  crit: boolean;
}

export interface HitSave {
  /** Extra damage rolls, to be dealt with the hit's own. */
  damage: { roll: Roll; type: DamageType }[];
  effects: Effect[];
  notes: string[];
}

const NOTHING: HitSave = { damage: [], effects: [], notes: [] };
const titled = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

function extraDamage(on: OnHit, saved: boolean, crit: boolean, rng: Rng): HitSave['damage'] {
  if (saved && !on.half) return [];
  return (on.damage ?? []).map((d) => {
    const rolled = roll(crit ? critDice(d.dice) : d.dice, rng);
    return { roll: saved ? { ...rolled, total: Math.floor(rolled.total / 2) } : rolled, type: d.type };
  });
}

/** The conditions as one effect on the target, with its repeated save when it has one. */
function conditionEffect({ attacker, target }: HitSaveInput, on: OnHit): Effect[] {
  const conditions = on.conditions ?? [];
  if (!conditions.length || (on.maxSize !== undefined && target.token.size > on.maxSize)) return [];
  const repeats = on.repeatSave && on.save;
  return [
    {
      id: `${conditions[0]!}-${attacker.token.id}`,
      name: conditions.map(titled).join(', '),
      conditions,
      source: attacker.token.id,
      ...(on.rounds && { rounds: on.rounds }),
      ...(on.escape && { escape: on.escape }),
      ...(repeats && { repeatSave: true, save: on.save }),
    },
  ];
}

function saveNote(name: string, save: SaveRoll, effects: readonly Effect[]): string {
  const result = save.success ? 'saved' : 'failed';
  const left = effects.length ? `: ${effects.map((e) => e.name).join(', ')}` : '';
  return `${name}: ${save.ability.toUpperCase()} save ${save.total} vs DC ${save.dc}, ${result}${left}`;
}

/** What an attack's rider does to the target it hit; call it only for a hit. */
export function hitSave(input: HitSaveInput, rng: Rng = Math.random): HitSave {
  const on = input.attack.onHit;
  if (!on) return NOTHING;
  const save = on.save && rollSave(input.target.sheet, on.save.ability, on.save.dc, rng);
  const saved = !!save?.success;
  const effects = saved ? [] : conditionEffect(input, on);
  const notes = save ? [saveNote(input.target.token.name, save, effects)] : effects.map((e) => e.name);
  return { damage: extraDamage(on, saved, input.crit, rng), effects, notes };
}
