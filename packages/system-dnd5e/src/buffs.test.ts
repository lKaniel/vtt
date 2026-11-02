import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import type { Effect } from './spell-schema.ts';
import { resolveCast } from './spells.ts';
import type { Edition } from './stats-schema.ts';

const spell = (id: string, edition: Edition = '2014') => srdFor(edition).spells.get(id)!;
const cleric = TokenSchema.parse({
  id: 'cleric',
  name: 'Cleric',
  x: 50,
  y: 150,
  ownership: { default: 'limited', ana: 'owner' },
  stats: { class: 'cleric', level: 5, abilities: { wis: 16, dex: 14, con: 12 } },
});
const ally = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'bo',
    name: 'Bo',
    x: 50,
    y: 50,
    ownership: { default: 'limited', bo: 'owner' },
    stats: { class: 'fighter', level: 3, abilities: { dex: 14, con: 14 } },
    ...patch,
  });
const sheetOf = (token: Token, edition: Edition = '2014') => resolveCreature(token, srdFor(edition))!;
const side = (token: Token, edition: Edition = '2014') => ({ token, sheet: sheetOf(token, edition) });
const cast = (id: string, target: Token, { slot, edition = '2014' }: { slot?: number; edition?: Edition } = {}) => {
  const s = spell(id, edition);
  return resolveCast(
    { spell: s, slot: slot ?? s.level, caster: side(cleric, edition), targets: [side(target, edition)], gridSize: 100 },
    () => 0.5,
  ).results[0]!;
};
const wearing = (token: Token, effect: Effect | undefined) => ({
  ...token,
  effects: [...(token.effects ?? []), effect!],
});

describe('buff spells', () => {
  it('mage armor makes unarmored AC 13 + dex', () => {
    const bo = ally();
    expect(sheetOf(bo).ac).toBe(12);
    expect(sheetOf(wearing(bo, cast('mage-armor', bo).effect)).ac).toBe(15);
  });

  it('mage armor does nothing over worn armor', () => {
    const bo = ally({ inventory: [{ item: 'chain-mail', equipped: true, qty: 1 }] });
    expect(sheetOf(wearing(bo, cast('mage-armor', bo).effect)).ac).toBe(16);
  });

  it('barkskin sets a floor on AC: 16, or 17 in 2024', () => {
    const bo = ally();
    expect(sheetOf(wearing(bo, cast('barkskin', bo).effect)).ac).toBe(16);
    expect(sheetOf(wearing(bo, cast('barkskin', bo, { edition: '2024' }).effect), '2024').ac).toBe(17);
    const plated = ally({ inventory: [{ item: 'plate', equipped: true, qty: 1 }] });
    expect(sheetOf(wearing(plated, cast('barkskin', plated).effect)).ac).toBe(18);
  });

  it('longstrider adds 10 ft of speed and blur gives attackers disadvantage', () => {
    const bo = ally();
    expect(sheetOf(wearing(bo, cast('longstrider', bo).effect)).speed).toBe(40);
    expect(cast('blur', cleric).effect).toMatchObject({ disadvantageAgainst: true, concentration: true });
  });

  it('aid raises max and current hp by 5 per slot above 1st', () => {
    const bo = ally({ hp: 10 });
    const max = sheetOf(bo).maxHp;
    const result = cast('aid', bo, { slot: 3 });
    expect(result).toMatchObject({ healed: 10, hp: 20 });
    expect(sheetOf(wearing({ ...bo, hp: result.hp }, result.effect)).maxHp).toBe(max + 10);
  });

  it('aid on a creature at full hp keeps it at full', () => {
    const bo = ally();
    const max = sheetOf(bo).maxHp;
    const result = cast('aid', bo);
    expect(result).toMatchObject({ healed: 5, hp: max + 5 });
  });

  it('heroism gives temporary hp equal to the caster’s modifier each turn', () => {
    expect(cast('heroism', ally()).effect).toMatchObject({ turnTempHp: 3, concentration: true });
  });

  it('lesser restoration ends a blinding or poisoning effect', () => {
    const bo = ally({
      effects: [
        { id: 'ray', name: 'Blindness', conditions: ['blinded'] },
        { id: 'bless', name: 'Bless', attackBonus: '1d4' },
      ],
    });
    expect(cast('lesser-restoration', bo).cured).toEqual(['ray']);
  });

  it('heal also cures blindness', () => {
    const bo = ally({ hp: 1, effects: [{ id: 'ray', name: 'Blindness', conditions: ['blinded'] }] });
    expect(cast('heal', bo)).toMatchObject({ cured: ['ray'], healed: sheetOf(bo).maxHp - 1 });
  });

  it('revivify brings back a dead character with 1 hp, and does nothing to the living', () => {
    const dead = ally({ hp: 0, deathSaves: { successes: 0, failures: 3 } });
    expect(cast('revivify', dead)).toMatchObject({ revived: true, hp: 1 });
    expect(cast('revivify', ally()).revived).toBeUndefined();
  });

  it('resurrection brings the dead back with all their hit points', () => {
    const dead = ally({ hp: 0, deathSaves: { successes: 0, failures: 3 } });
    expect(cast('resurrection', dead)).toMatchObject({ revived: true, hp: sheetOf(dead).maxHp });
  });

  it('protection from poison ends poisoning and leaves resistance behind', () => {
    const bo = ally({ effects: [{ id: 'sting', name: 'Sting', conditions: ['poisoned'] }] });
    const result = cast('protection-from-poison', bo);
    expect(result.cured).toEqual(['sting']);
    expect(result.effect).toMatchObject({ resistances: ['poison'], saveAdvantage: ['con'] });
  });
});

describe('haste and slow', () => {
  it('haste doubles speed, adds 2 AC and Dex save advantage, and gives an attack each turn', () => {
    const bo = ally();
    const effect = cast('haste', bo).effect;
    expect(effect).toMatchObject({ ac: 2, saveAdvantage: ['dex'], turnAttacks: 1, concentration: true });
    expect(sheetOf(wearing(bo, effect))).toMatchObject({ speed: 60, ac: 14 });
  });

  it('slow halves speed and takes 2 AC', () => {
    const bo = ally();
    expect(sheetOf(wearing(bo, { ...cast('slow', bo).effect!, id: 'slow' }))).toMatchObject({ speed: 15, ac: 10 });
  });
});

describe('area fixes', () => {
  it('2014 web restrains on a failed Dex save; 2024 entangle and wall of fire cover an area', () => {
    expect(spell('web')).toMatchObject({
      automated: true,
      save: { ability: 'dex' },
      effect: { conditions: ['restrained'] },
    });
    expect(spell('entangle', '2024').area).toMatchObject({ shape: 'cube', size: 20 });
    expect(spell('wall-of-fire', '2024').area).toMatchObject({ shape: 'line', size: 60 });
    expect(spell('sleet-storm')).toMatchObject({ automated: true, effect: { conditions: ['prone'] } });
  });
});
