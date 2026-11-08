import { describe, expect, it } from 'vitest';
import { huntContent, huntSheet as sheet, jaeger } from './jaeger.fixture.ts';
import { resolveCreature } from './creature.ts';
import { useFeature } from './features.ts';
import { gainMomentum, momentumDice } from './momentum.ts';
import { bleedTick, finisherDamage, finisherOnHit, finisherProblem, poolSpell } from './finishers.ts';
import { dodge, parry } from './focus-arts.ts';
import { hitReactions } from './hit-reactions.ts';
import { resolveWeaponAttack, type WeaponAttackOutcome } from './weapon-attack.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { featureSpell } from './features.ts';

const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;
const ogre = (data: object = {}) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre', ...data });
const side = (t: Token) => ({ token: t, sheet: resolveCreature(t, huntContent)! });

/** A 4th-level jaeger with a longsword, `dice` momentum dice and the finishers picked. */
function armed(dice: number, features: string[] = []): Token {
  const t = jaeger(4, { inventory: [{ item: 'longsword', equipped: true, qty: 1 }], features });
  return dice ? gainMomentum(t, sheet(t), dice) : t;
}
const sword = (t: Token) => sheet(t).attacks.find((a) => a.name === 'Longsword')!;

describe('hit finishers', () => {
  it('brutal finisher adds the held dice to the hit', () => {
    const t = armed(2);
    expect(finisherProblem(sheet(t), 'brutal-finisher')).toBeUndefined();
    expect(finisherProblem(sheet(armed(0)), 'brutal-finisher')).toMatch(/no momentum/);
    expect(finisherProblem(sheet(t), 'breaking-blow')).toMatch(/doesn't know/);
    const extra = finisherDamage(sheet(t), sword(t), 'brutal-finisher')!;
    expect(extra).toEqual({ dice: '2d6', type: 'slashing' });
    const out = resolveWeaponAttack(
      {
        attacker: side(t),
        target: side(ogre()),
        attack: sword(t),
        range: 'normal',
        gridSize: 100,
        allyNearTarget: false,
        sneakUsed: false,
        finisher: extra,
      },
      rngOf([face(15, 20), face(8, 8), face(6, 6), face(6, 6)]),
    );
    expect(out.roll.damage.map((d) => d.roll.total)).toEqual([8 + 1, 12]);
  });

  it('a brutal finisher that drops the target gives a focus point back', () => {
    const t = armed(2);
    const input = {
      attacker: side(t),
      target: side(ogre()),
      feature: sheet(t).features.find((f) => f.id === 'brutal-finisher')!,
    };
    expect(finisherOnHit({ ...input, downed: true }, rngOf([])).regain).toBe(1);
    expect(finisherOnHit({ ...input, downed: false }, rngOf([])).regain).toBe(0);
  });

  it('breaking blow: the condition grows with the dice, and a failed save gives a point back', () => {
    const t = armed(3, ['jaeger/breaking-blow']);
    const feature = sheet(t).features.find((f) => f.id === 'breaking-blow')!;
    const out = finisherOnHit(
      { attacker: side(t), target: side(ogre()), feature, downed: false },
      rngOf([face(1, 20)]),
    );
    expect(out.effects[0]).toMatchObject({
      conditions: ['restrained'],
      repeatSave: true,
      save: { ability: 'str', dc: 13 },
    });
    expect(out.regain).toBe(1);
  });

  it('hemorrhaging wound bleeds a die less each turn until a save stops it', () => {
    const t = armed(3, ['jaeger/hemorrhaging-wound']);
    const feature = sheet(t).features.find((f) => f.id === 'hemorrhaging-wound')!;
    const [effect] = finisherOnHit(
      { attacker: side(t), target: side(ogre()), feature, downed: false },
      rngOf([]),
    ).effects;
    expect(effect!.bleed).toEqual({ dice: 3, die: 6, dc: 13 });
    const ogreSheet = side(ogre()).sheet;
    const tick = bleedTick(effect!, ogreSheet, rngOf([face(2, 6), face(2, 6), face(2, 6), face(1, 20)]));
    expect(tick).toMatchObject({ lost: 6, effect: { bleed: { dice: 2 } } });
    expect(bleedTick(effect!, ogreSheet, rngOf([0.001, 0.001, 0.001, face(20, 20)])).saved).toBe(true);
  });
});

describe('finishers as their own action', () => {
  it('a chasing finisher gives movement, an attack and the dice on its hit, spending the dice', () => {
    const t = armed(2, ['jaeger/chasing-finisher']);
    const out = useFeature(t, sheet(t), 'chasing-finisher');
    expect(out).toMatchObject({ dash: 20, grantAttacks: 1 });
    expect(out.effect).toMatchObject({ hitDamage: [{ dice: '2d6', type: 'weapon' }], once: true });
    expect(momentumDice(sheet(out.token))?.dice).toBe(0);
  });

  it('a vicious finisher makes the next attack a spectral claw that crits sooner', () => {
    const t = armed(3, ['jaeger/vicious-finisher']);
    const out = useFeature(t, sheet(t), 'vicious-finisher');
    expect(out.effect).toMatchObject({ critRange: 14, weaponSpell: { dice: ['1d12'], ability: 'dex' } });
  });

  it('a volley is a cone with the dice as damage and a Dex-based DC', () => {
    const t = armed(2, ['jaeger/volley-finisher']);
    const feature = sheet(t).features.find((f) => f.id === 'volley-finisher')!;
    const spell = poolSpell(featureSpell(feature), feature, sheet(t));
    expect(spell).toMatchObject({ area: { shape: 'cone', size: 30 }, damage: [{ dice: '2d6' }], save: { dc: 13 } });
  });
});

describe('focus arts against a hit', () => {
  const hit = (amount: number): WeaponAttackOutcome => ({
    roll: {
      d20: { total: 18 } as never,
      natural: 15,
      total: 18,
      hit: true,
      crit: false,
      damage: [{ roll: { total: amount } as never, type: 'bludgeoning' }],
    },
    sneak: false,
    smote: false,
    targetEffects: [],
    used: [],
    notes: [],
  });

  it('are offered while a point is left', () => {
    const t = armed(0);
    expect(hitReactions(side(t), hit(10).roll)).toEqual(['weapon-parry', 'dodge-step']);
    const spent = jaeger(4, { spent: { uses: { focus: 2 } } });
    expect(hitReactions(side(spent), hit(10).roll)).toEqual([]);
  });

  it('weapon parry blocks the weapon roll; a 20 that blocks it all stuns', () => {
    const t = side(armed(0));
    const blocked = parry(hit(10), t.sheet, rngOf([face(10, 20), face(5, 8)]));
    expect(blocked).toMatchObject({ blocked: 6, stuns: false });
    expect(blocked.outcome.roll.damage[0]!.roll.total).toBe(4);
    expect(parry(hit(10), t.sheet, rngOf([face(20, 20), face(5, 8), face(5, 8)])).stuns).toBe(true);
    expect(parry(hit(10), t.sheet, rngOf([face(1, 20)])).blocked).toBe(0);
  });

  it('dodge step evades on a Dex save against the attack roll, else halves it', () => {
    const t = side(armed(0));
    expect(dodge(hit(10), t.sheet, rngOf([face(20, 20)])).outcome.roll.damage[0]!.roll.total).toBe(0);
    expect(dodge(hit(10), t.sheet, rngOf([face(2, 20)])).outcome.roll.damage[0]!.roll.total).toBe(5);
  });
});
