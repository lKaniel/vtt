import { describe, expect, it } from 'vitest';
import { applyDamage } from './attack.ts';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { type Token, TokenSchema } from './token-schema.ts';
import { resolveCast, withAgain, withChoice } from './spells.ts';
import type { Edition } from './stats-schema.ts';

// Spells that work through weapons and blows: shillelagh, 2024 true strike,
// 2024 resistance and 2024 dragon's breath.

const spell = (id: string, edition: Edition) => srdFor(edition).spells.get(id)!;
const druid = (patch: Partial<Token> = {}) =>
  TokenSchema.parse({
    id: 'dru',
    name: 'Druid',
    x: 50,
    y: 50,
    ownership: { default: 'limited', ana: 'owner' },
    stats: { class: 'druid', level: 5, abilities: { str: 10, dex: 10, wis: 18 } },
    inventory: [{ item: 'quarterstaff', equipped: true }],
    ...patch,
  });
const side = (token: Token, edition: Edition) => ({ token, sheet: resolveCreature(token, srdFor(edition))! });
const selfCast = (id: string, edition: Edition, choice?: string, token = druid()) => {
  const s = withChoice(spell(id, edition), choice);
  const [r] = resolveCast({
    spell: s,
    slot: s.level,
    caster: side(token, edition),
    targets: [side(token, edition)],
    gridSize: 100,
  }).results;
  return r!.effect!;
};
const staff = (token: Token, edition: Edition) =>
  side(token, edition).sheet.attacks.find((a) => a.name.startsWith('Quarterstaff'))!;

describe('shillelagh', () => {
  it.each(['2014', '2024'] as const)('%s: the staff hits with Wisdom and a bigger die', (edition) => {
    const before = staff(druid(), edition);
    const after = staff(druid({ effects: [selfCast('shillelagh', edition)] }), edition);
    // Wisdom 18 (+4) instead of Strength 10 (+0).
    expect(after.toHit).toBe(before.toHit + 4);
    expect(after.damage[0]!.dice).toBe(edition === '2014' ? '1d8+4' : '1d10+4');
    expect(after.weapon?.ability).toBe('wis');
  });

  it('2024: may deal force damage', () => {
    const after = staff(druid({ effects: [selfCast('shillelagh', '2024', 'force')] }), '2024');
    expect(after.damage[0]!.type).toBe('force');
  });
});

describe('true strike (2024)', () => {
  it('the next weapon attack uses the spellcasting ability and adds radiant damage, then ends', () => {
    const effect = selfCast('true-strike', '2024');
    expect(effect).toMatchObject({ endsOnAttack: true, hitDamage: [{ dice: '1d6', type: 'radiant' }] });
    expect(staff(druid({ effects: [effect] }), '2024').weapon?.ability).toBe('wis');
    expect(spell('true-strike', '2024').weaponStrike).toBe(true);
  });
});

describe('resistance (2024)', () => {
  it('takes a d4 off damage of the chosen type, once a turn', () => {
    const effect = selfCast('resistance', '2024', 'fire');
    const sheet = side(druid({ effects: [effect] }), '2024').sheet;
    const hit = applyDamage(sheet, [{ amount: 10, type: 'fire' }], () => 0.99);
    expect(hit).toMatchObject({ dealt: [6], warded: effect.id });
    expect(applyDamage(sheet, [{ amount: 10, type: 'cold' }], () => 0.99).dealt).toEqual([10]);
    const used = side(druid({ effects: [{ ...effect, wardUsed: true }] }), '2024').sheet;
    expect(applyDamage(used, [{ amount: 10, type: 'fire' }], () => 0.99).dealt).toEqual([10]);
  });
});

describe("dragon's breath (2024)", () => {
  it('lets the creature touched exhale a cone with the caster’s DC on later turns', () => {
    const effect = selfCast('dragons-breath', '2024', 'cold');
    expect(effect.repeat).toMatchObject({ spell: 'dragons-breath', slot: 2, choice: 'cold', dc: 15 });
    const breath = withAgain(withChoice(spell('dragons-breath', '2024'), 'cold'));
    expect(breath).toMatchObject({ area: { shape: 'cone', size: 15 }, save: { ability: 'dex', onSave: 'half' } });
    expect(breath.damage).toEqual([{ dice: '3d6', type: 'cold' }]);
    expect(breath.effect).toBeUndefined();
  });

  it('shows on the sheet of the creature it was handed to, even one with no spells', () => {
    const effect = selfCast('dragons-breath', '2024', 'cold');
    const fighter = TokenSchema.parse({
      id: 'f',
      name: 'Fighter',
      x: 0,
      y: 0,
      stats: { class: 'fighter', level: 1 },
      effects: [effect],
    });
    expect(side(fighter, '2024').sheet.caster?.spells.map((s) => s.id)).toEqual(['dragons-breath']);
  });
});
