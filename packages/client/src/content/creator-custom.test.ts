import { characterSkills, issuesByStep, newCharacter } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { chooseBackground, chooseSpecies } from './creator.ts';
import {
  editCustomBackground,
  editCustomSpecies,
  flexibleBonusAbilities,
  pickFlexBonus,
  addProficiency,
  removeProficiency,
  toggleBackgroundAbility,
  toggleBackgroundSkill,
  toggleExpertise,
  toggleExtraSkill,
} from './creator-custom.ts';

const fresh = (rules: '2014' | '2024' = '2014') => newCharacter({ id: 'new', owner: 'me', rules });

describe('custom species', () => {
  it('starts with a name to change and keeps its size on the character', () => {
    const c = chooseSpecies(fresh(), 'custom');
    expect(c.customSpecies).toMatchObject({ name: 'Custom species', size: 'medium', speed: 30 });
    expect(issuesByStep(c).species).toEqual([]);
    const small = editCustomSpecies(c, { name: 'Moth-folk', size: 'small' });
    expect(small).toMatchObject({ size: 'small', customSpecies: { name: 'Moth-folk', size: 'small' } });
  });

  it('lets a 2014 player put +2 and +1 on any abilities', () => {
    const c = chooseSpecies(fresh(), 'custom');
    expect(flexibleBonusAbilities(c)).toHaveLength(6);
    const two = pickFlexBonus(pickFlexBonus(c, 'str', 2), 'con', 1);
    expect(two.bonusPicks).toEqual({ str: 2, con: 1 });
    expect(pickFlexBonus(two, 'dex', 2).bonusPicks).toEqual({ dex: 2, con: 1 });
    expect(pickFlexBonus(two, 'str', 1).bonusPicks).toEqual({ str: 1 });
    expect(pickFlexBonus(two, 'str', 2).bonusPicks).toEqual({ con: 1 });
    expect(flexibleBonusAbilities(fresh())).toBeUndefined();
  });
});

describe('custom background', () => {
  it('picks two skills, dropping them from the class picks', () => {
    const c = { ...chooseBackground(fresh(), 'custom'), skills: ['athletics'] };
    const one = toggleBackgroundSkill(c, 'athletics');
    expect(one.customBackground?.skills).toEqual(['athletics']);
    expect(one.skills).toEqual([]);
    const full = toggleBackgroundSkill(toggleBackgroundSkill(one, 'history'), 'arcana');
    expect(full.customBackground?.skills).toEqual(['athletics', 'history']);
    expect(issuesByStep(full).background).toEqual([]);
  });

  it('2024: picks three abilities to raise, and the +2/+1 go only there', () => {
    let c = chooseBackground(fresh('2024'), 'custom');
    for (const a of ['str', 'dex', 'con', 'wis'] as const) c = toggleBackgroundAbility(c, a);
    expect(c.customBackground?.abilities).toEqual(['str', 'dex', 'con']);
    expect(flexibleBonusAbilities(c)).toEqual(['str', 'dex', 'con']);
    expect(pickFlexBonus(c, 'wis', 2)).toBe(c);
    const named = editCustomBackground(c, { name: 'Lamplighter', feat: { name: 'Alert', description: '' } });
    expect(named.customBackground).toMatchObject({ name: 'Lamplighter', feat: { name: 'Alert' } });
  });
});

describe('custom proficiencies', () => {
  it('adds skills and expertise in skills the character has', () => {
    const c = toggleExtraSkill(fresh(), 'stealth');
    expect(characterSkills(c)).toContain('stealth');
    expect(toggleExpertise(c, 'stealth').expertise).toEqual(['stealth']);
    expect(toggleExpertise(c, 'arcana')).toBe(c);
    expect(toggleExtraSkill(toggleExpertise(c, 'stealth'), 'stealth')).toMatchObject({
      extraSkills: [],
      expertise: [],
    });
  });

  it('adds other proficiencies from the list, each once, and takes them away', () => {
    const c = addProficiency(addProficiency(addProficiency(fresh(), 'thieves-tools'), 'elvish'), 'elvish');
    expect(c.proficiencies).toEqual(['thieves-tools', 'elvish']);
    expect(removeProficiency(c, 'thieves-tools').proficiencies).toEqual(['elvish']);
  });
});
