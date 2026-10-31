import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { resolveCreature } from './creature.ts';
import { featureProblem, useFeature } from './features.ts';
import { TokenSchema, type Token } from './schema.ts';
import type { Edition } from './stats-schema.ts';

const character = (cls: string, rules: Edition, data: object = {}, level = 3) =>
  TokenSchema.parse({
    id: 'pc',
    name: 'PC',
    x: 50,
    y: 50,
    stats: { class: cls, level, rules, maxHp: 30, abilities: { str: 16, dex: 14, con: 16, wis: 16, cha: 16 } },
    ...data,
  });
const sheet = (t: Token) => resolveCreature(t, srdFor(t.stats?.rules ?? '2014'))!;
const feature = (t: Token, id: string) => sheet(t).features.find((f) => f.id === id);

describe('actions anyone can take', () => {
  it('gives every creature Dash, Dodge and Disengage, monsters too', () => {
    const goblin = TokenSchema.parse({ id: 'g', name: 'G', x: 0, y: 0, monster: 'goblin' });
    for (const t of [character('wizard', '2014'), goblin]) {
      expect(['dash', 'dodge', 'disengage'].map((id) => feature(t, id)?.action)).toEqual([
        'action',
        'action',
        'action',
      ]);
    }
  });

  it('dodges: attacks against it have disadvantage and it has advantage on Dex saves until its next turn', () => {
    const t = character('wizard', '2014');
    const out = useFeature(t, sheet(t), 'dodge');
    expect(out.effect).toMatchObject({ disadvantageAgainst: true, saveAdvantage: ['dex'], rounds: 1, source: 'pc' });
  });

  it('dashes: the creature gets its speed again as movement', () => {
    const t = character('wizard', '2014');
    expect(useFeature(t, sheet(t), 'dash').dash).toBe(30);
  });

  it('lets a rogue dash and disengage as a bonus action with Cunning Action', () => {
    const rogue = character('rogue', '2014');
    expect(feature(rogue, 'cunning-dash')).toMatchObject({ action: 'bonus', name: 'Dash (Cunning Action)' });
    expect(feature(rogue, 'cunning-disengage')?.action).toBe('bonus');
    expect(feature(character('rogue', '2014', {}, 1), 'cunning-dash')).toBeUndefined();
    expect(feature(character('fighter', '2014'), 'cunning-dash')).toBeUndefined();
  });
});

describe('passive class features', () => {
  it('gives an unarmored barbarian 10 + Dex + Con AC and a monk 10 + Dex + Wis', () => {
    expect(sheet(character('barbarian', '2014')).ac).toBe(10 + 2 + 3);
    expect(sheet(character('monk', '2024')).ac).toBe(10 + 2 + 3);
    const armored = character('barbarian', '2014', { inventory: [{ item: 'chain-mail', equipped: true }] });
    expect(sheet(armored).ac).toBe(16);
  });

  it('gives a barbarian advantage on Dex saves (danger sense)', () => {
    expect(sheet(character('barbarian', '2014')).effects).toContainEqual(
      expect.objectContaining({ name: 'Danger Sense', saveAdvantage: ['dex'] }),
    );
  });

  it('attacks recklessly: advantage for it and against it until its next turn', () => {
    const b = character('barbarian', '2024');
    expect(useFeature(b, sheet(b), 'reckless-attack').effect).toMatchObject({
      advantage: true,
      advantageAgainst: true,
      rounds: 1,
    });
  });
});

describe('features that act on others', () => {
  it('counts Bardic Inspiration uses from Charisma, with a die that grows with level', () => {
    const bard = character('bard', '2014');
    expect(feature(bard, 'bardic-inspiration')).toMatchObject({ max: 3, left: 3, action: 'bonus' });
    expect(feature(bard, 'bardic-inspiration')?.spell).toMatchObject({
      range: 60,
      effect: { attackBonus: '1d6', saveBonus: '1d6', once: true },
    });
    expect(feature(character('bard', '2014', {}, 10), 'bardic-inspiration')?.spell?.effect?.attackBonus).toBe('1d10');
  });

  it('pools 5 hit points per paladin level for Lay on Hands', () => {
    expect(feature(character('paladin', '2014'), 'lay-on-hands')).toMatchObject({
      max: 15,
      left: 15,
      action: 'action',
    });
    expect(feature(character('paladin', '2024'), 'lay-on-hands')?.action).toBe('bonus');
  });

  it('turns undead with the cleric’s Channel Divinity uses', () => {
    const cleric = character('cleric', '2014');
    expect(feature(cleric, 'turn-undead')?.spell).toMatchObject({
      area: { shape: 'emanation', size: 30 },
      save: { ability: 'wis' },
      creatureTypes: ['undead'],
    });
    const used = character('cleric', '2014', { spent: { uses: { 'channel-divinity': 1 } } });
    expect(featureProblem(sheet(used), 'turn-undead')).toMatch(/no uses left/);
  });
});
