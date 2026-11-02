import { describe, expect, it } from 'vitest';
import { applyNumberChanges, changeText, EffectChangeSchema, resolveCreature, srdFor, TokenSchema } from './index.ts';

const token = (data: object) => TokenSchema.parse({ id: 't', name: 'T', x: 50, y: 50, ...data });
const fighter = (changes: object[], extra: object = {}) =>
  resolveCreature(
    token({
      stats: { level: 5, maxHp: 40, abilities: { str: 14, dex: 12, con: 14 } },
      inventory: [{ item: 'longsword', equipped: true }],
      effects: [{ id: 'e', name: 'E', changes }],
      ...extra,
    }),
    srdFor('2014'),
  )!;

describe('effect changes by key', () => {
  it('folds changes in mode order: multiply, add, downgrade, upgrade, override', () => {
    const c = (mode: string, value: number) => EffectChangeSchema.parse({ key: 'ac', mode, value });
    expect(applyNumberChanges(10, [c('add', 2), c('multiply', 2)])).toBe(22);
    expect(applyNumberChanges(10, [c('upgrade', 15), c('add', 1)])).toBe(15);
    expect(applyNumberChanges(18, [c('downgrade', 12)])).toBe(12);
    expect(applyNumberChanges(10, [c('override', 19), c('add', 5)])).toBe(19);
  });

  it('refuses unknown keys and values of the wrong kind', () => {
    expect(EffectChangeSchema.safeParse({ key: 'nope', value: 1 }).success).toBe(false);
    expect(EffectChangeSchema.safeParse({ key: 'ac', value: 'fire' }).success).toBe(false);
    expect(EffectChangeSchema.safeParse({ key: 'resistances', value: 'nope' }).success).toBe(false);
    expect(EffectChangeSchema.parse({ key: 'resistances', value: 'fire' }).mode).toBe('add');
  });

  it('changes an ability score before anything is worked out from it', () => {
    const c = fighter([{ key: 'abilities.str', mode: 'override', value: 19 }]);
    expect(c.abilities.str).toBe(19);
    expect(c.attacks.find((a) => a.name === 'Longsword')!.toHit).toBe(4 + 3);
    expect(c.saves.str).toBe(4);
  });

  it('changes AC, speed, initiative, saves and attack rolls', () => {
    const c = fighter([
      { key: 'ac', value: 1 },
      { key: 'speed', value: 10 },
      { key: 'initiative', value: 5 },
      { key: 'saves.all', value: 1 },
      { key: 'saves.dex', value: 2 },
      { key: 'toHit', value: 1 },
    ]);
    expect(c).toMatchObject({ ac: 12, speed: 40, initiative: 6 });
    expect(c.saves).toMatchObject({ dex: 4, wis: 1 });
    expect(c.attacks.find((a) => a.name === 'Longsword')!.toHit).toBe(6);
  });

  it('raises the hit point maximum and keeps an unhurt creature at full', () => {
    expect(fighter([{ key: 'maxHp', value: 5 }])).toMatchObject({ maxHp: 45, hp: 45 });
    expect(fighter([{ key: 'maxHp', value: -30 }], { hp: 30 })).toMatchObject({ maxHp: 10, hp: 10 });
  });

  it('adds damage resistances, immunities and vulnerabilities', () => {
    const c = fighter([
      { key: 'resistances', value: 'fire' },
      { key: 'immunities', value: 'poison' },
      { key: 'vulnerabilities', value: 'cold' },
    ]);
    expect(c.resistances).toContain('fire');
    expect(c.immunities).toContain('poison');
    expect(c.vulnerabilities).toContain('cold');
  });

  it('works from a feature that is always on', () => {
    const c = resolveCreature(
      token({
        stats: { level: 1, abilities: { str: 8 } },
        own: {
          features: [
            {
              id: 'belt',
              name: 'Belt',
              description: '',
              passive: { changes: [{ key: 'abilities.str', mode: 'override', value: 21 }] },
            },
          ],
        },
      }),
      srdFor('2014'),
    )!;
    expect(c.abilities.str).toBe(21);
  });

  it('a held creature stays still whatever its changes say', () => {
    const c = fighter([{ key: 'speed', value: 10 }], {
      effects: [{ id: 'h', name: 'H', conditions: ['grappled'], changes: [{ key: 'speed', value: 10 }] }],
    });
    expect(c.speed).toBe(0);
  });
});

describe('changeText', () => {
  it('says what a change does in a few words', () => {
    const t = (key: string, mode: string, value: number | string) =>
      changeText(EffectChangeSchema.parse({ key, mode, value }));
    expect(t('abilities.str', 'override', 19)).toBe('STR = 19');
    expect(t('ac', 'add', 1)).toBe('AC +1');
    expect(t('speed', 'add', -10)).toBe('Speed -10');
    expect(t('speed', 'multiply', 2)).toBe('Speed ×2');
    expect(t('saves.all', 'add', 1)).toBe('All saves +1');
    expect(t('saves.dex', 'upgrade', 5)).toBe('DEX save at least 5');
    expect(t('maxHp', 'downgrade', 10)).toBe('Max HP at most 10');
    expect(t('resistances', 'add', 'fire')).toBe('Resists fire');
    expect(t('immunities', 'add', 'poison')).toBe('Immune to poison');
    expect(t('vulnerabilities', 'add', 'cold')).toBe('Vulnerable to cold');
  });
});
