import { describe, expect, it } from 'vitest';
import { huntContent, huntSheet as sheet, jaeger } from './jaeger.fixture.ts';
import { resolveCreature } from './creature.ts';
import { featureSpell, spendUse, useFeature } from './features.ts';
import { gainMomentum, momentumDice, momentumForSpend } from './momentum.ts';
import { finisherDamage, finisherOnHit, finisherProblem, poolSpell } from './finishers.ts';
import { parry } from './focus-arts.ts';
import { artBoost, fellOnFinish, triggered } from './chapters.ts';
import { styleDamage } from './class-styles.ts';
import type { WeaponAttackOutcome } from './weapon-attack.ts';
import { type Token, TokenSchema } from './token-schema.ts';

const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;
const ogre = (data: object = {}) =>
  TokenSchema.parse({ id: 'ogre', name: 'Ogre', x: 150, y: 50, monster: 'ogre', ...data });
const side = (t: Token) => ({ token: t, sheet: resolveCreature(t, huntContent)! });
const feature = (t: Token, id: string) => sheet(t).features.find((f) => f.id === id)!;
const gear = (...items: string[]) => items.map((item) => ({ item, equipped: true, qty: 1 }));

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

describe('every Chapter feature', () => {
  it('runs, or says how the GM runs it', () => {
    const run = ['action', 'passive', 'effect', 'spell', 'finisher', 'artBoost', 'trigger', 'finisherProne'];
    const subclasses = huntContent.classes.get('jaeger')!.subclasses!;
    const silent = subclasses
      .flatMap((s) => s.features)
      .filter((f) => !f.manual && !run.some((k) => f[k as keyof typeof f] !== undefined));
    expect(silent.map((f) => f.id)).toEqual([]);
    expect(subclasses.find((s) => s.id === 'salvation-chapter')!.features).toHaveLength(5);
  });
});

describe('Absolute Chapter', () => {
  const absolute = (level: number, data = {}) =>
    jaeger(level, { chapter: 'absolute', inventory: gear('longsword'), ...data });

  it('counter strike: a parry blocks half the level more and strikes back with the rest', () => {
    const t = absolute(6);
    expect(artBoost(sheet(t))).toEqual({ parryBonus: 3, counter: true, sureDodge: false });
    // 12 + 3 on the d20 beats AC 11; 8 on the d8 + 1 + 3 blocks 12 of a 5-damage hit: 7 back.
    const out = parry(hit(5), sheet(t), rngOf([face(12, 20), face(8, 8)]), { bonus: 3, counterAc: 11 });
    expect(out).toMatchObject({ blocked: 5, counter: 7 });
    const missed = parry(hit(5), sheet(t), rngOf([face(2, 20), face(8, 8)]), { bonus: 3, counterAc: 11 });
    expect(missed.counter).toBe(0);
  });

  it('counter strike: a point spent on a focus art readies advantage on the next attack', () => {
    const t = absolute(3);
    const parried = spendUse(t, feature(t, 'weapon-parry'), 1, sheet(t));
    expect(parried.effects).toMatchObject([{ advantage: true, once: true }]);
    const plain = jaeger(3, { inventory: gear('longsword') });
    expect(spendUse(plain, feature(plain, 'weapon-parry'), 1, sheet(plain)).effects).toBeUndefined();
  });

  it('unencumbered movement: 10 feet faster in light armor or none, not in medium', () => {
    expect(sheet(absolute(3)).speed).toBe(40);
    expect(sheet(absolute(3, { inventory: gear('leather') })).speed).toBe(40);
    expect(sheet(absolute(3, { inventory: gear('scale-mail') })).speed).toBe(30);
  });

  it('the hunt: two momentum dice a point for a minute, free of paralysis and restraint', () => {
    const t = absolute(17);
    const out = useFeature(t, sheet(t), 'the-hunt');
    expect(out.effect).toMatchObject({ rounds: 10, conditionImmunities: ['paralyzed', 'restrained'] });
    const hunting = sheet(out.token);
    expect(momentumForSpend(hunting, feature(out.token, 'weapon-parry'), 1)).toBe(2);
    expect(feature(out.token, 'the-hunt').left).toBe(0);
  });
});

describe('Marauder Chapter', () => {
  const marauder = (level: number, data = {}) =>
    jaeger(level, { chapter: 'marauder', inventory: gear('greatsword'), ...data });

  it('marauder momentum: a two-handed weapon makes the die bigger', () => {
    expect(momentumDice(sheet(marauder(3)))?.die).toBe(8);
    expect(momentumDice(sheet(marauder(3, { inventory: gear('longsword') })))?.die).toBe(6);
    expect(momentumDice(sheet(marauder(17)))?.die).toBe(12);
  });

  it('marauder momentum: Constitution in medium armor when it beats Dexterity', () => {
    const scale = gear('scale-mail');
    const tough = { abilities: { dex: 12, con: 16 }, inventory: scale };
    expect(sheet(marauder(3, tough)).ac).toBe(14 + 2);
    expect(sheet(jaeger(3, tough)).ac).toBe(14 + 1);
  });

  it('great cleave: a die on a two-handed hit, then an attack per die at other foes', () => {
    const t = gainMomentum(marauder(4), sheet(marauder(4)), 3);
    const greatsword = sheet(t).attacks.find((a) => a.name === 'Greatsword')!;
    expect(finisherProblem(sheet(t), 'path-of-gore', greatsword)).toBeUndefined();
    expect(finisherDamage(sheet(t), greatsword, 'path-of-gore')).toEqual({ dice: '1d8', type: 'slashing' });
    const sword = jaeger(4, { chapter: 'marauder', inventory: gear('longsword') });
    const swordSheet = sheet(gainMomentum(sword, sheet(sword), 1));
    expect(finisherProblem(swordSheet, 'path-of-gore', swordSheet.attacks[0])).toMatch(/two-handed/);
    const out = finisherOnHit(
      { attacker: side(t), target: side(ogre()), feature: feature(t, 'path-of-gore'), downed: true },
      rngOf([]),
    );
    expect(out).toMatchObject({ attacks: 3, regain: 1 });
  });

  it('fell the leviathan: a Strength save after a finisher, at disadvantage for the Large', () => {
    const t = marauder(14);
    // DC 8 + 5 + 1 = 14; the ogre (Str +4) rolls 15 then 3 and takes the 3.
    const big = fellOnFinish(
      { attacker: side(t), target: side(ogre({ size: 2 })) },
      rngOf([face(15, 20), face(3, 20)]),
    );
    expect(big.effect).toMatchObject({ conditions: ['prone'] });
    const small = fellOnFinish({ attacker: side(t), target: side(ogre({ size: 1 })) }, rngOf([face(15, 20)]));
    expect(small.effect).toBeUndefined();
    expect(fellOnFinish({ attacker: side(marauder(13)), target: side(ogre()) }, rngOf([])).note).toBeUndefined();
  });

  it('titanic strength: double the dice to one past the most, and half Strength on two-handed hits', () => {
    const t = marauder(17, { abilities: { str: 17 } });
    const held = gainMomentum(t, sheet(t), 6);
    const out = useFeature(held, sheet(held), 'titanic-strength');
    expect(momentumDice(sheet(out.token))).toMatchObject({ dice: 10, max: 9 });
    const greatsword = sheet(t).attacks.find((a) => a.name === 'Greatsword')!;
    expect(styleDamage(sheet(t), greatsword)).toEqual([{ dice: '2', type: 'slashing' }]);
  });
});

describe('Salvation Chapter', () => {
  it('prayer of salvation heals two (three from 14th, by 1d12) and gives as many temporary hit points', () => {
    const spellAt = (level: number) =>
      featureSpell(feature(jaeger(level, { chapter: 'salvation' }), 'art-of-salvation'));
    expect(spellAt(3)).toMatchObject({
      targets: 2,
      heal: '1d6',
      healTemp: true,
      cures: ['charmed', 'frightened', 'poisoned'],
    });
    expect(spellAt(14)).toMatchObject({ targets: 3, heal: '1d12' });
  });

  it("savior's focus: a point back when an ally drops, once a minute", () => {
    const t = jaeger(3, { chapter: 'salvation', spent: { uses: { focus: 2 } } });
    const once = triggered(t, sheet(t), 'ally-down');
    expect(feature(once.token, 'focus').left).toBe(1);
    expect(triggered(once.token, sheet(once.token), 'ally-down').token).toBe(once.token);
  });

  it('light of hope: a bright aura of blessing for a minute', () => {
    const t = jaeger(17, { chapter: 'salvation' });
    expect(useFeature(t, sheet(t), 'light-of-hope').effect).toMatchObject({
      attackBonus: '1d4',
      saveBonus: '1d4',
      aura: { radius: 30, who: 'allies' },
      light: { bright: 30, dim: 30 },
    });
  });
});

describe('Sanguine Chapter', () => {
  it('blood drain: a Con save against the better of Int and Con, the dice as necrotic damage, half drained', () => {
    const t = jaeger(4, { chapter: 'sanguine', abilities: { con: 16 } });
    const held = gainMomentum(t, sheet(t), 2);
    const drain = feature(held, 'vital-consumption');
    expect(poolSpell(featureSpell(drain), drain, sheet(held))).toMatchObject({
      save: { ability: 'con', onSave: 'half', dc: 13 },
      damage: [{ dice: '2d6', type: 'necrotic' }],
      drain: true,
    });
  });

  it('crimson rage: a point and a die on becoming bloodied', () => {
    const t = jaeger(3, { chapter: 'sanguine', spent: { uses: { focus: 1 } } });
    const out = triggered(t, sheet(t), 'bloodied');
    expect(feature(out.token, 'focus').left).toBe(2);
    expect(momentumDice(sheet(out.token))?.dice).toBe(1);
    expect(out.notes).toEqual(["Hunter's Crimson Rage"]);
  });

  it('blood frenzy: faster and a third attack while bloodied', () => {
    const fine = sheet(jaeger(17, { chapter: 'sanguine' }));
    const bloodied = sheet(jaeger(17, { chapter: 'sanguine', hp: 20 }));
    expect([fine.speed, fine.attacksPerAction]).toEqual([30, 2]);
    expect([bloodied.speed, bloodied.attacksPerAction]).toEqual([50, 3]);
  });
});
