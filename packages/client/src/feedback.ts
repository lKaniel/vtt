import type { AttackLog, ChatMessage, DamageType, SpellLog, SpellTargetLog } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';

// What the map plays when an attack or spell comes through chat: a timeline
// of cues (swing, missile, burst, flinch, floating number). Cues name tokens
// by id; the map looks up where they stand when each cue plays.

/** What colours an effect: a damage type, plain weapons, healing, or other magic. */
export type Element = DamageType | 'steel' | 'heal' | 'arcane';

/** How a floating number looks. */
export type Tone = 'damage' | 'crit' | 'heal' | 'miss' | 'note';

/** A token id, or a point on the map. */
export type Where = string | Point;

export type Cue = { at: number } & (
  | { kind: 'lunge'; token: string; toward: string }
  | { kind: 'slash'; from: string; to: string; element: Element }
  | { kind: 'missile'; from: string; to: Where; element: Element; style: 'arrow' | 'orb'; duration: number }
  /** `radius` in feet. */
  | { kind: 'burst'; where: Where; radius: number; element: Element }
  /** A cone or line from the caster toward `to`, `length` feet long. */
  | { kind: 'spray'; from: string; to: Point; length: number; wide: boolean; element: Element }
  /** The caster gathering the spell. */
  | { kind: 'channel'; token: string; element: Element }
  /** The target flinches: a flash and a shake. */
  | { kind: 'impact'; token: string; element: Element }
  /** Healing or a blessing settling on a creature. */
  | { kind: 'glow'; token: string; element: Element }
  | { kind: 'number'; token: string; text: string; tone: Tone }
);

/** When a blow lands after it starts, ms. */
export const IMPACT = { melee: 220, arrow: 320, orb: 420, spray: 380 } as const;
/** When the swing starts after the lunge, ms. */
const SWING = 90;
/** Time the caster spends channelling before the spell flies, ms. */
const CHANNEL = 260;
/** Gap between darts or beams of one spell, ms. */
const STAGGER = 140;
/** A named effect shows a moment after the damage number. */
const NOTE_DELAY = 180;
/** A teleport or summon puff, in feet. */
const PUFF = 5;

const PHYSICAL = new Set<DamageType>(['slashing', 'piercing', 'bludgeoning']);

const COLORS: Record<Element, number> = {
  steel: 0xcfe0ff,
  heal: 0x7ee08a,
  arcane: 0xb48cff,
  acid: 0x9be33a,
  bludgeoning: 0xe8e4da,
  cold: 0x8fd8ff,
  fire: 0xff8a2a,
  force: 0xc77dff,
  lightning: 0xbfe6ff,
  necrotic: 0x8a4fb0,
  piercing: 0xe8e4da,
  poison: 0x6fbf3a,
  psychic: 0xff7ad9,
  radiant: 0xffe08a,
  slashing: 0xe8e4da,
  thunder: 0x9fb8ff,
};

export function elementColor(element: Element): number {
  return COLORS[element];
}

/** The cues for one chat message; plain chat plays nothing. */
export function cuesOf(message: ChatMessage): Cue[] {
  if (message.attack) return attackCues(message.attack);
  if (message.spell) return spellCues(message.spell);
  return [];
}

/** Weapons glow in their first magical damage type, else they're plain steel. */
function weaponElement(log: AttackLog): Element {
  return log.parts.find((p) => !PHYSICAL.has(p.type))?.type ?? 'steel';
}

function attackCues(log: AttackLog): Cue[] {
  const element = weaponElement(log);
  const { attackerId: from, targetId: to } = log;
  const melee = log.kind === 'melee';
  const lands = melee ? IMPACT.melee : IMPACT.arrow;
  const delivery: Cue[] = melee
    ? [
        { at: 0, kind: 'lunge', token: from, toward: to },
        { at: SWING, kind: 'slash', from, to, element },
      ]
    : [{ at: 0, kind: 'missile', from, to, element, style: 'arrow', duration: IMPACT.arrow }];
  const outcome = { target: to, targetId: to, hit: log.hit, crit: log.crit, damage: log.damage };
  return [...delivery, ...landing(outcome, lands, element)];
}

/** What happens to a target when the blow arrives at `at`. */
function landing(r: SpellTargetLog, at: number, element: Element): Cue[] {
  const token = r.targetId;
  const say = (text: string, tone: Tone, delay = 0): Cue => ({ at: at + delay, kind: 'number', token, text, tone });
  if (r.immune) return [say('Immune', 'miss')];
  if (r.hit === false) return [say('Miss', 'miss')];
  const out: Cue[] = [];
  if (r.healed) out.push({ at, kind: 'glow', token, element: 'heal' }, say(`+${r.healed}`, 'heal'));
  if (r.damage > 0) out.push({ at, kind: 'impact', token, element }, say(String(r.damage), r.crit ? 'crit' : 'damage'));
  if (r.effect) out.push(say(r.effect, 'note', out.length ? NOTE_DELAY : 0));
  return out.length ? out : nothingLanded(r, say);
}

/** A target that took no damage and got no effect: it saved, or the hit did nothing. */
function nothingLanded(r: SpellTargetLog, say: (text: string, tone: Tone) => Cue): Cue[] {
  if (r.save?.success) return [say('Saved', 'miss')];
  return r.hit ? [say('0', 'damage')] : [];
}

function spellElement(log: SpellLog): Element {
  if (log.damageType) return PHYSICAL.has(log.damageType) ? 'steel' : log.damageType;
  return log.results.some((r) => r.healed) ? 'heal' : 'arcane';
}

function spellCues(log: SpellLog): Cue[] {
  const element = spellElement(log);
  const channel: Cue = { at: 0, kind: 'channel', token: log.casterId, element };
  const body = log.area ? areaCues(log, element) : targetCues(log, element);
  return [channel, ...body];
}

/** One area: everyone in it is hit when it goes off. */
function areaCues(log: SpellLog, element: Element): Cue[] {
  const area = log.area!;
  const from = log.casterId;
  let blast: Cue[];
  let lands: number;
  if (area.shape === 'emanation' || !log.point) {
    lands = CHANNEL;
    blast = [{ at: lands, kind: 'burst', where: from, radius: area.size, element }];
  } else if (area.shape === 'cone' || area.shape === 'line') {
    lands = CHANNEL + IMPACT.spray;
    const wide = area.shape === 'cone';
    blast = [{ at: CHANNEL, kind: 'spray', from, to: log.point, length: area.size, wide, element }];
  } else {
    lands = CHANNEL + IMPACT.orb;
    blast = [
      { at: CHANNEL, kind: 'missile', from, to: log.point, element, style: 'orb', duration: IMPACT.orb },
      { at: lands, kind: 'burst', where: log.point, radius: area.size, element },
    ];
  }
  return [...blast, ...log.results.flatMap((r) => landing(r, lands, element))];
}

/** Bolts or touches, one per target or beam, one after another; otherwise it just lands. */
function targetCues(log: SpellLog, element: Element): Cue[] {
  const from = log.casterId;
  const puff: Cue[] = log.point ? [{ at: CHANNEL, kind: 'burst', where: log.point, radius: PUFF, element }] : [];
  const each = log.results.flatMap((r, i): Cue[] => {
    const start = CHANNEL + i * STAGGER;
    const to = r.targetId;
    if (log.attackKind === 'melee') {
      return [{ at: start, kind: 'slash', from, to, element }, ...landing(r, start + IMPACT.melee, element)];
    }
    if (to === from || !flies(log, r)) return landing(r, start, element);
    const bolt: Cue = { at: start, kind: 'missile', from, to, element, style: 'orb', duration: IMPACT.orb };
    return [bolt, ...landing(r, start + IMPACT.orb, element)];
  });
  return [...puff, ...each];
}

/** Spell attacks and save-less damage (magic missile) fly; saves and healing just happen. */
function flies(log: SpellLog, r: SpellTargetLog): boolean {
  return log.attackKind === 'ranged' || (!!log.damageType && !r.save && !r.healed);
}
