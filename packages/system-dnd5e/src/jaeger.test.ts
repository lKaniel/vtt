import { describe, expect, it } from 'vitest';
import { huntContent, huntPacks, huntSheet as sheet, jaeger } from './jaeger.fixture.ts';
import { useFeature } from './features.ts';
import { choicesDue } from './class-options.ts';
import {
  gainMomentum,
  keepMomentum,
  momentumDice,
  regainOnInitiative,
  regainOnNat20,
  spendMomentum,
} from './momentum.ts';
import { sensesOf } from './perception.ts';
import { dnd5e } from './system.ts';
import { withEvasion } from './spell-saves.ts';
import { rollSpellSave } from './effects.ts';
import type { Spell } from './spell-schema.ts';

const face = (n: number, sides: number) => (n - 1) / sides + 0.001;
const rngOf = (values: number[]) => () => values.shift() ?? 0.001;

const feature = (t: Parameters<typeof sheet>[0], id: string) => sheet(t).features.find((f) => f.id === id);

describe('a class from a pack takes its automation by id', () => {
  it('gets the hit die, saves, extra attack and features the pack leaves out', () => {
    const cls = huntContent.classes.get('jaeger')!;
    expect(cls).toMatchObject({ hitDie: 8, saves: ['dex', 'int'], subclassLevel: 3 });
    expect(cls.subclasses?.[0]).toMatchObject({ id: 'absolute-chapter' });
    expect(sheet(jaeger(5)).attacksPerAction).toBe(2);
    expect(feature(jaeger(1), 'focus')).toMatchObject({ max: 1, left: 1, recharge: 'short' });
  });
});

describe('focus points', () => {
  it('grow with the level, and focused fighting adds a point and a focus art', () => {
    expect(feature(jaeger(5), 'focus')?.max).toBe(3);
    const focused = jaeger(5, { features: ['jaeger/focused-fighting'] });
    expect(feature(focused, 'focus')?.max).toBe(4);
    const arts = choicesDue(huntContent.classes.get('jaeger')!, 5, ['jaeger/focused-fighting']);
    expect(arts.find((c) => c.id === 'focus-art')?.count).toBe(2);
  });

  it('weapon parry and dodge step share the points', () => {
    const t = jaeger(2, { spent: { uses: { focus: 1 } } });
    expect(feature(t, 'weapon-parry')).toMatchObject({ left: 1, max: 2 });
  });

  it('come back one at a time on a natural 20 and on initiative with none left', () => {
    const t = jaeger(2, { spent: { uses: { focus: 2 } } });
    expect(feature(regainOnNat20(t, sheet(t)), 'focus')?.left).toBe(1);
    expect(feature(regainOnInitiative(t, sheet(t)), 'focus')?.left).toBe(1);
    const some = jaeger(2, { spent: { uses: { focus: 1 } } });
    expect(regainOnInitiative(some, sheet(some))).toBe(some);
  });
});

describe('momentum dice', () => {
  it('come from spending focus points from 2nd level, flourish giving one more', () => {
    const t = jaeger(2, { features: ['jaeger/flourish'] });
    const out = useFeature(t, sheet(t), 'flourish');
    expect(momentumDice(sheet(out.token))).toEqual({ dice: 2, max: 5, die: 6 });
    expect(feature(out.token, 'focus')?.left).toBe(1);
    const first = jaeger(1, { features: ['jaeger/jaegers-rush'] });
    expect(momentumDice(sheet(useFeature(first, sheet(first), 'jaegers-rush').token))).toBeUndefined();
  });

  it('stop at proficiency + the better of Str and Dex, and grow in size', () => {
    const t = jaeger(11);
    expect(momentumDice(sheet(gainMomentum(t, sheet(t), 9)))).toEqual({ dice: 7, max: 7, die: 8 });
  });

  it('last while you gain dice, attack or end a turn by a foe; else they fade', () => {
    const t = jaeger(2);
    const fresh = gainMomentum(t, sheet(t), 2);
    const kept = keepMomentum(fresh, false);
    expect(momentumDice(sheet(kept))?.dice).toBe(2);
    expect(momentumDice(sheet(keepMomentum(kept, true)))?.dice).toBe(2);
    expect(momentumDice(sheet(keepMomentum(kept, false)))?.dice).toBe(0);
    expect(momentumDice(sheet(spendMomentum(fresh)))?.dice).toBe(0);
  });
});

describe('piercing gaze and eternal watch', () => {
  it('give darkvision, then see invisibility and truesight as the jaeger grows', () => {
    const at = (level: number) => {
      const t = jaeger(level, { darkvision: 60 });
      return sensesOf(useFeature(t, sheet(t), 'piercing-gaze').token);
    };
    expect(at(3)).toMatchObject({ darkvision: 120, seeInvisible: false });
    expect(at(7)).toMatchObject({ seeInvisible: true, truesight: 0 });
    expect(at(13)).toMatchObject({ truesight: 120 });
    expect(sensesOf(jaeger(3)).darkvision).toBe(0);
    expect(sheet(jaeger(18)).senses).toMatchObject({ darkvision: 60, seeInvisible: true, truesight: 120 });
    expect(dnd5e.perceiver(jaeger(18), '2014', huntPacks).senses.truesight).toBe(120);
  });
});

describe('evasion and inured to madness', () => {
  const fireball = { save: { ability: 'dex', onSave: 'half' } } as Spell;
  const saved = (success: boolean) => ({ ability: 'dex' as const, dc: 15, total: 10, success });

  it('evasion: nothing on a saved Dex save for half, half on a failed one', () => {
    const t = sheet(jaeger(9));
    const base = { attack: undefined, landed: false, half: true };
    expect(withEvasion(t, fireball, { ...base, save: saved(true) })).toMatchObject({ landed: false, half: false });
    expect(withEvasion(t, fireball, { ...base, landed: true, half: false, save: saved(false) })).toMatchObject({
      landed: true,
      half: true,
    });
    expect(withEvasion(sheet(jaeger(8)), fireball, { ...base, save: saved(true) }).half).toBe(true);
  });

  it('inured to madness: advantage on saves against charm and fear', () => {
    const t = sheet(jaeger(15));
    const rng = rngOf([face(2, 20), face(19, 20)]);
    expect(rollSpellSave(t, { ability: 'wis', dc: 10, vs: ['frightened'] }, rng).success).toBe(true);
    expect(
      rollSpellSave(t, { ability: 'wis', dc: 10, vs: ['poisoned'] }, rngOf([face(2, 20), face(19, 20)])).success,
    ).toBe(false);
  });
});

describe("the jaeger's automation", () => {
  it('runs every feature or says how the GM runs it', () => {
    const run = ['action', 'passive', 'effect', 'spell', 'hitArt', 'momentum', 'finisher', 'moreUses', 'momentumOn'];
    const cls = huntContent.classes.get('jaeger')!;
    const silent = cls.features.filter(
      (f) => !f.manual && !f.uses && !run.some((k) => f[k as keyof typeof f] !== undefined),
    );
    expect(silent.map((f) => f.id)).toEqual([]);
  });
});
