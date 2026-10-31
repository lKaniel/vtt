import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import type { Spell } from './spell-schema.ts';
import type { Edition } from './stats-schema.ts';

// Guards for the hand-written automation: a spell the engine claims to run
// must do something when it lands, and must not hurt the one casting it.

const EDITIONS: Edition[] = ['2014', '2024'];
const automated = (edition: Edition) => [...srdFor(edition).spells.values()].filter((s) => s.automated);

/** Self spells that really do make the caster roll a save or take damage. */
const HURTS_CASTER_ON_PURPOSE = new Set(['contact-other-plane']);

const doesSomething = (s: Spell) =>
  [s.damage.length, s.effect, s.heal, s.tempHp, s.summon, s.teleport, s.push, s.hpPool, s.stabilize].some(Boolean);

describe.each(EDITIONS)('automated %s spells', (edition) => {
  it('never damage or save against their own caster', () => {
    const selfHarm = automated(edition)
      .filter((s) => s.targets === 0 && !s.area && !s.rider && (s.damage.length > 0 || s.save))
      .filter((s) => !HURTS_CASTER_ON_PURPOSE.has(s.id))
      .map((s) => s.id);
    expect(selfHarm).toEqual([]);
  });

  it('do something to whoever they land on', () => {
    expect(
      automated(edition)
        .filter((s) => !doesSomething(s))
        .map((s) => s.id),
    ).toEqual([]);
  });

  it('heal only when healing is all they do (temporary hit points are not healing)', () => {
    expect(
      automated(edition)
        .filter((s) => s.heal && s.rounds && !s.effect)
        .map((s) => s.id),
    ).toEqual([]);
  });
});
