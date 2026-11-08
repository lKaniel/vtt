import { describe, expect, it } from 'vitest';
import { huntContent, huntSheet as sheet, jaeger } from './jaeger.fixture.ts';
import { useFeature } from './features.ts';
import { momentumDice } from './momentum.ts';
import { artBoost, slotMomentum } from './chapters.ts';
import { spellLimits } from './character-rules.ts';
import { classCasting } from './multiclass.ts';

// The Heretic Chapter: a jaeger that casts warlock spells with Intelligence
// from slots all of one level, back on a short rest.

const heretic = (level: number, data = {}) => jaeger(level, { chapter: 'heretic', abilities: { int: 14 }, ...data });
const caster = (level: number) => sheet(heretic(level)).caster;

describe('heretic magic', () => {
  it('casts with Intelligence from its own table of pact slots', () => {
    expect(caster(3)).toMatchObject({ ability: 'int', dc: 8 + 2 + 2, attack: 4, pact: true });
    expect(caster(3)!.slots.slice(0, 4)).toEqual([1, 0, 0, 0]);
    expect(caster(7)!.slots.slice(0, 4)).toEqual([0, 2, 0, 0]);
    expect(caster(19)!.slots.slice(0, 4)).toEqual([0, 0, 0, 2]);
    expect(sheet(jaeger(3, { chapter: 'absolute' })).caster).toBeUndefined();
  });

  it('knows cantrips and spells from the warlock list by its table', () => {
    const casting = classCasting(huntContent.classes.get('jaeger'), 'heretic-chapter')!;
    expect(casting.list).toBe('warlock');
    const at = (level: number) => spellLimits({ classId: 'jaeger', level, edition: '2014', mod: 2, casting });
    expect(at(3)).toEqual({ cantrips: 2, spells: 2, maxLevel: 1 });
    expect(at(10)).toEqual({ cantrips: 3, spells: 4, maxLevel: 2 });
    expect(at(2).maxLevel).toBe(0);
  });
});

describe('the heretic’s other features', () => {
  it('spell flurry: a weapon attack for a focus point', () => {
    const t = heretic(3);
    const out = useFeature(t, sheet(t), 'arcane-arts');
    expect(out.grantAttacks).toBe(1);
    expect(out.token.spent?.uses).toEqual({ focus: 1 });
  });

  it('shrouded steps: dodge step always works from 7th level', () => {
    expect(artBoost(sheet(heretic(7))).sureDodge).toBe(true);
    expect(artBoost(sheet(heretic(6))).sureDodge).toBe(false);
  });

  it('mystical momentum: a spent slot gives as many dice as its level', () => {
    const t = heretic(14);
    expect(momentumDice(sheet(slotMomentum(t, sheet(t), 3)))?.dice).toBe(3);
    expect(slotMomentum(heretic(13), sheet(heretic(13)), 3)).toEqual(heretic(13));
  });

  it('darkness within: wings of shadow, resistance and a cloak of darkness', () => {
    const t = heretic(17);
    const out = useFeature(t, sheet(t), 'darkness-within');
    expect(sheet(out.token).speeds?.fly).toBe(30);
    expect(sheet(out.token).resistances).toEqual(expect.arrayContaining(['bludgeoning', 'piercing', 'slashing']));
  });
});
