import { describe, expect, it } from 'vitest';
import { srdFor } from './content.ts';
import { foundryProficiencies } from './foundry-proficiencies.ts';

// A Foundry dnd5e character's armor, weapon, tool and language
// proficiencies, as ids of our proficiency lists (proficiency-catalog.ts).

const srd = srdFor('2014');

describe('foundryProficiencies', () => {
  it('reads armor, weapon groups, single weapons and languages, with their typed-in extras', () => {
    const sys = {
      traits: {
        armorProf: { value: ['lgt', 'med', 'shl'], custom: '' },
        weaponProf: { value: ['sim', 'handcrossbow', 'longsword', 'warpick'], custom: 'Whips; Blades of Fire' },
        languages: { value: ['common', 'deep', 'cant', 'aquan', 'gith'], custom: 'Old Tongue' },
      },
    };
    expect(foundryProficiencies(sys, srd)).toEqual([
      'light-armor',
      'medium-armor',
      'shields',
      'simple-weapons',
      'hand-crossbow',
      'longsword',
      'war-pick',
      'whip',
      'Blades of Fire',
      'common',
      'deep-speech',
      'thieves-cant',
      'primordial',
      'Gith',
      'Old Tongue',
    ]);
  });

  it("reads tools from dnd5e 3+ (system.tools) and from older worlds' toolProf", () => {
    const modern = { tools: { thief: { value: 1 }, herb: { value: 0 }, lute: { value: 2 } } };
    expect(foundryProficiencies(modern, srd)).toEqual(['thieves-tools', 'lute']);
    const old = { traits: { toolProf: { value: ['disg', 'navg', 'card'], custom: "Cook's utensils" } } };
    expect(foundryProficiencies(old, srd)).toEqual([
      'disguise-kit',
      'navigators-tools',
      'playing-card-set',
      'cooks-utensils',
    ]);
  });

  it('gives each once and nothing for a creature without any', () => {
    expect(foundryProficiencies({ traits: { languages: { value: ['ignan', 'terran'] } } }, srd)).toEqual([
      'primordial',
    ]);
    expect(foundryProficiencies({}, srd)).toEqual([]);
  });
});
