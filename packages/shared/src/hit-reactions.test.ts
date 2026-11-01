import { describe, expect, it } from 'vitest';
import type { AttackRoll } from './attack.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { halved, hitReactions, shielded } from './hit-reactions.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { WeaponAttackOutcome } from './weapon-attack.ts';

const pc = (cls: string, data: object = {}) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    ownership: { default: 'limited', ana: 'owner' },
    stats: { class: cls, level: 5, abilities: { dex: 14 }, spells: cls === 'wizard' ? ['shield'] : [] },
    ...data,
  });
const side = (token: Token) => ({ token, sheet: resolveCreature(token, srdFor('2014'))! });
const d20 = { formula: '1d20+4', terms: [], total: 0 } as unknown as AttackRoll['d20'];
const hit = (total: number, crit = false): AttackRoll => ({
  d20,
  natural: crit ? 20 : 10,
  total,
  hit: true,
  crit,
  damage: [{ roll: { formula: '1d6+2', terms: [], total: 7 }, type: 'slashing' }],
});
const outcome = (roll: AttackRoll): WeaponAttackOutcome => ({
  roll,
  sneak: true,
  smote: false,
  push: 5,
  targetEffects: [{ id: 'sapped', name: 'Sapped' }],
  used: [],
  notes: ['sneak attack'],
});

describe('reactions to being hit', () => {
  it('offers shield when +5 AC would turn the hit into a miss', () => {
    const wiz = side(pc('wizard'));
    expect(wiz.sheet.ac).toBe(12);
    expect(hitReactions(wiz, hit(16))).toEqual(['shield']);
    expect(hitReactions(wiz, hit(17))).toEqual([]);
    expect(hitReactions(wiz, hit(13, true))).toEqual([]);
  });

  it('needs a slot of any level left for shield', () => {
    const tired = side(pc('wizard', { spent: { slots: [4, 3, 2] } }));
    expect(hitReactions(tired, hit(12))).toEqual([]);
  });

  it('offers uncanny dodge to a 5th-level rogue', () => {
    expect(hitReactions(side(pc('rogue')), hit(15))).toEqual(['uncanny-dodge']);
  });

  it('a shielded hit becomes a miss with nothing that rides on it', () => {
    const out = shielded(outcome(hit(14)));
    expect(out.roll).toMatchObject({ hit: false, damage: [] });
    expect(out).toMatchObject({ sneak: false, push: undefined, targetEffects: [], notes: ['shield'] });
  });

  it('a dodged hit deals half damage', () => {
    expect(halved(outcome(hit(14))).roll.damage[0]!.roll.total).toBe(3);
  });
});
