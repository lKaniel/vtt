import type { AttackLog, ChatMessage, DamageType, SpellLog, SpellTargetLog } from '@vtt/system-dnd5e';
import type { Point } from '@vtt/shared';
import { type Animation, animationOf, isRangedVideo, type Motion } from './animations.ts';

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
  | {
      kind: 'missile';
      from: string;
      to: Where;
      element: Element;
      style: 'arrow' | 'orb';
      duration: number;
      /** A crackling bolt; missing: only lightning crackles. */
      jagged?: boolean;
    }
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
  /** A video (a JB2A pack's): stretched from `from` to `to` when `ranged`, else played on `to`. */
  | { kind: 'video'; from: string; to: string; src: string; ranged: boolean }
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
/** When a video projectile reaches its target, and when an on-target video peaks, ms. */
const VIDEO_FLIGHT = 700;
const VIDEO_PEAK = 350;
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
export function cuesOf(message: ChatMessage, motion: Motion = 'full'): Cue[] {
  if (message.attack) return trimmed(attackCues(message.attack), motion);
  if (message.spell) return trimmed(spellCues(message.spell), motion);
  return [];
}

/** What stays when animations are reduced (the landing) or off (the numbers). */
const KEPT: Record<Exclude<Motion, 'full'>, ReadonlySet<Cue['kind']>> = {
  reduced: new Set(['impact', 'glow', 'number']),
  off: new Set(['number']),
};

/** The cues a player wants, starting at once when the lead-up is cut. */
function trimmed(cues: Cue[], motion: Motion): Cue[] {
  if (motion === 'full') return cues;
  const kept = cues.filter((c) => KEPT[motion].has(c.kind));
  const first = Math.min(...kept.map((c) => c.at));
  return kept.map((c) => ({ ...c, at: c.at - first }));
}

/** The cues that carry a blow from `from` to `to`, starting at `at`, and when it lands. */
function delivered(
  anim: Animation,
  { from, to, element, at }: { from: string; to: string; element: Element; at: number },
): { cues: Cue[]; lands: number } {
  const how = anim.delivery;
  switch (how) {
    case 'swing':
      return {
        cues: [
          { at, kind: 'lunge', token: from, toward: to },
          { at: at + SWING, kind: 'slash', from, to, element },
        ],
        lands: at + IMPACT.melee,
      };
    case 'arrow':
    case 'orb':
    case 'bolt': {
      const style = how === 'arrow' ? 'arrow' : 'orb';
      const duration = IMPACT[style];
      const missile: Cue = { at, kind: 'missile', from, to, element, style, duration };
      return { cues: [how === 'bolt' ? { ...missile, jagged: true } : missile], lands: at + duration };
    }
    case 'fall':
      return { cues: [{ at, kind: 'glow', token: to, element }], lands: at + IMPACT.melee };
    case 'video':
      return video(anim.src!, { from, to, at });
    case 'none':
      return { cues: [], lands: at };
  }
}

/** A video blow: a projectile lands when it arrives, anything else as it peaks. */
function video(src: string, { from, to, at }: { from: string; to: string; at: number }) {
  const ranged = isRangedVideo(src);
  const cues: Cue[] = [{ at, kind: 'video', from, to, src, ranged }];
  return { cues, lands: at + (ranged ? VIDEO_FLIGHT : VIDEO_PEAK) };
}

/** Weapons glow in their first magical damage type, else they're plain steel. */
function weaponElement(log: AttackLog): Element {
  return log.parts.find((p) => !PHYSICAL.has(p.type))?.type ?? 'steel';
}

function attackCues(log: AttackLog): Cue[] {
  const chosen = animationOf(log.animation);
  const element = chosen?.element ?? weaponElement(log);
  const { attackerId: from, targetId: to } = log;
  const how = chosen ?? { delivery: log.kind === 'melee' ? 'swing' : 'arrow' };
  const { cues, lands } = delivered(how, { from, to, element, at: 0 });
  const outcome = { target: to, targetId: to, hit: log.hit, crit: log.crit, damage: log.damage };
  return [...cues, ...landing(outcome, lands, element)];
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
  const chosen = animationOf(log.animation);
  const element = chosen?.element ?? spellElement(log);
  const channel: Cue = { at: 0, kind: 'channel', token: log.casterId, element };
  const body = log.area ? areaCues(log, element) : targetCues(log, element, chosen);
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
function targetCues(log: SpellLog, element: Element, chosen: Animation | undefined): Cue[] {
  const from = log.casterId;
  const puff: Cue[] = log.point ? [{ at: CHANNEL, kind: 'burst', where: log.point, radius: PUFF, element }] : [];
  const each = log.results.flatMap((r, i): Cue[] => {
    const start = CHANNEL + i * STAGGER;
    const to = r.targetId;
    if (chosen && to !== from) {
      const { cues, lands } = delivered(chosen, { from, to, element, at: start });
      return [...cues, ...landing(r, lands, element)];
    }
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
