import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE } from '@vtt/shared';
import { expireEffects, lastingEnds, nextEnd, roundsLeft, stampDurations } from './durations.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Effect } from './spell-schema.ts';

const token = (data: object = {}): Token => TokenSchema.parse({ id: 'ana', name: 'Ana', x: 50, y: 50, ...data });
const effect = (data: Partial<Effect>): Effect => ({ id: 'e', name: 'E', ...data });
const rounds = (spell: string) => ({ bless: 10, 'mage-armor': 4800, 'conjure-animals': 600 })[spell];

describe('stamping durations on what lasts', () => {
  it('gives effects that last rounds a game time to end at', () => {
    const t = token({ effects: [effect({ id: 'bless', rounds: 10 }), effect({ id: 'mark' })] });
    const out = stampDurations(t, 1000, rounds);
    expect(out.effects).toEqual([effect({ id: 'bless', rounds: 10, endsAt: 1060 }), effect({ id: 'mark' })]);
    // Already stamped: left alone.
    expect(stampDurations(out, 5000, rounds)).toBe(out);
  });

  it('times concentration and summons by their spell', () => {
    const caster = token({ concentration: { spell: 'bless', name: 'Bless' } });
    expect(stampDurations(caster, 0, rounds).concentration).toEqual({ spell: 'bless', name: 'Bless', endsAt: 60 });
    const wolf = token({ summon: { by: 'ana', spell: 'conjure-animals', concentration: true } });
    expect(stampDurations(wolf, 0, rounds).summon?.endsAt).toBe(HOUR);
    const forever = token({ concentration: { spell: 'unknown', name: 'Unknown' } });
    expect(stampDurations(forever, 0, rounds)).toBe(forever);
  });
});

describe('time running out', () => {
  const t = token({
    effects: [
      effect({ id: 'bless', name: 'Bless', rounds: 10, endsAt: 60 }),
      effect({ id: 'armor', name: 'Mage Armor', endsAt: 8 * HOUR }),
      effect({ id: 'curse', name: 'Curse' }),
    ],
  });

  it('ends effects whose time is up and leaves the rest', () => {
    const { token: after, ended } = expireEffects(t, 10 * MINUTE, false);
    expect(ended.map((e) => e.name)).toEqual(['Bless']);
    expect(after.effects?.map((e) => e.id)).toEqual(['armor', 'curse']);
    expect(expireEffects(t, 0, false).token).toBe(t);
  });

  it('leaves effects counted in rounds to the turns in a fight', () => {
    const { ended } = expireEffects(t, 9 * HOUR, true);
    expect(ended.map((e) => e.name)).toEqual(['Mage Armor']);
  });

  it('says how many rounds are left, for a fight starting', () => {
    const later = roundsLeft(t, 30);
    expect(later.effects?.[0]).toMatchObject({ rounds: 5 });
    expect(roundsLeft(t, 0)).toBe(t);
  });

  it('notices concentration and summons running out', () => {
    const caster = token({ concentration: { spell: 'bless', name: 'Bless', endsAt: 60 } });
    expect(lastingEnds(caster, 59)).toEqual({ concentration: false, summon: false });
    expect(lastingEnds(caster, 60)).toEqual({ concentration: true, summon: false });
    const wolf = token({ summon: { by: 'ana', spell: 'conjure-animals', concentration: false, endsAt: 60 } });
    expect(lastingEnds(wolf, 61).summon).toBe(true);
  });

  it('finds the next moment something ends', () => {
    const caster = token({ id: 'b', concentration: { spell: 'bless', name: 'Bless', endsAt: 30 } });
    expect(nextEnd([t, caster])).toBe(30);
    expect(nextEnd([token()])).toBeUndefined();
  });
});
