import { describe, expect, it } from 'vitest';
import { auraEffects, resolveValue, withAuras } from './auras.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { EffectChangeSchema } from './effect-changes.ts';
import { type Token, TokenSchema } from './token-schema.ts';

// Auras, like Active Auras: an effect with `aura` on a creature lands on the
// creatures around it (its allies, its foes or all), and comes off when they
// leave. The paladin (a party member) stands at (150, 150); a square is 100 px.

const party = { default: 'limited', ana: 'owner' };
const make = (id: string, x: number, extra: Record<string, unknown> = {}): Token =>
  TokenSchema.parse({ id, name: id, x, y: 150, stats: { level: 1 }, ...extra });

const paladin = (level: number, extra: Record<string, unknown> = {}) =>
  make('kara', 150, {
    ownership: party,
    stats: { class: 'paladin', level, abilities: { cha: 16 } },
    ...extra,
  });
const ally = (x: number) => make(`ally-${x}`, x, { ownership: { default: 'limited', bo: 'owner' } });
const foe = (x: number) => make(`foe-${x}`, x);

const bearers = (tokens: Token[]) => tokens.map((token) => ({ token, sheet: resolveCreature(token, srdFor('2014'))! }));
const auras = (tokens: Token[]) => auraEffects(bearers(tokens), { gridSize: 100 });

describe('change values', () => {
  it('take an ability modifier of the aura’s bearer, with a floor', () => {
    expect(EffectChangeSchema.safeParse({ key: 'saves.all', value: 'max(1,@cha)' }).success).toBe(true);
    expect(EffectChangeSchema.safeParse({ key: 'saves.all', value: 'lots' }).success).toBe(false);
    const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 8 };
    expect(resolveValue('@cha', abilities)).toBe(-1);
    expect(resolveValue('max(1,@cha)', abilities)).toBe(1);
    expect(resolveValue(3, abilities)).toBe(3);
  });
});

describe('the paladin’s Aura of Protection', () => {
  it('adds the paladin’s Charisma modifier to the saves of allies within 10 feet, and the paladin’s own', () => {
    const near = ally(350);
    const far = ally(550);
    const got = auras([paladin(6), near, far, foe(250)]);
    expect(got.get(near.id)?.map((e) => e.name)).toEqual(['Aura of Protection']);
    expect(got.get(near.id)?.[0]?.changes).toEqual([{ key: 'saves.all', mode: 'add', value: 3 }]);
    expect(got.get('kara')?.map((e) => e.name)).toEqual(['Aura of Protection']);
    expect(got.get(far.id)).toBeUndefined();
    expect(got.get('foe-250')).toBeUndefined();
  });

  it('reaches 30 feet at 18th level, and nothing before 6th', () => {
    expect(auras([paladin(18), ally(550)]).get('ally-550')).toHaveLength(2);
    expect(auras([paladin(5), ally(250)]).get('ally-250')).toBeUndefined();
  });

  it('works only while the paladin is conscious', () => {
    expect(auras([paladin(6, { hp: 0 }), ally(250)]).get('ally-250')).toBeUndefined();
  });

  it('shows on a saving throw', () => {
    const near = ally(250);
    const got = auras([paladin(6), near]);
    const raised = resolveCreature(withAuras(near, got.get(near.id) ?? [])!, srdFor('2014'))!;
    const plain = resolveCreature(near, srdFor('2014'))!;
    expect(raised.saves.wis).toBe(plain.saves.wis + 3);
  });
});

describe('Aura of Courage', () => {
  it('keeps allies near the paladin from being frightened', () => {
    const scared = { ...ally(250), effects: [{ id: 'fear', name: 'Fear', conditions: ['frightened' as const] }] };
    const got = auras([paladin(10), scared]);
    const brave = resolveCreature(withAuras(scared, got.get(scared.id) ?? [])!, srdFor('2014'))!;
    expect(brave.conditions).not.toContain('frightened');
  });
});

describe('an aura made by hand', () => {
  it('lands on foes only, and comes off when it no longer reaches', () => {
    const dread = {
      id: 'dread',
      name: 'Dread',
      aura: { radius: 15, who: 'enemies' as const },
      disadvantage: true,
    };
    const kara = paladin(1, { effects: [dread] });
    const near = foe(350);
    const got = auras([kara, near, ally(250)]);
    expect(got.get(near.id)?.[0]).toMatchObject({ name: 'Dread', disadvantage: true, source: 'kara' });
    expect(got.get('ally-250')).toBeUndefined();
    expect(got.get('kara')).toBeUndefined();
    const marked = withAuras(near, got.get(near.id)!)!;
    expect(withAuras(marked, got.get(near.id)!)).toBeUndefined();
    expect(withAuras(marked, [])!.effects).toEqual([]);
    // The bearer's own effect only gives off the aura.
    expect(resolveCreature(kara, srdFor('2014'))!.effects.some((e) => e.name === 'Dread')).toBe(false);
  });
});
