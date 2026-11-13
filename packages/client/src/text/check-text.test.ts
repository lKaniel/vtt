import { contentWith, gameCompendia, TOOLS } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { askedOf, checkNamed, checkOf, checkOptions, checkValue } from './check-text.ts';

const CHECK_OPTIONS = checkOptions();

describe('check choices', () => {
  it('lists the six abilities, every skill under its ability, then the saving throws', () => {
    expect(CHECK_OPTIONS.slice(0, 2)).toEqual([
      { value: 'str', label: 'Strength' },
      { value: 'dex', label: 'Dexterity' },
    ]);
    expect(CHECK_OPTIONS).toContainEqual({ value: 'dex:stealth', label: 'Stealth (Dex)' });
    expect(CHECK_OPTIONS).toContainEqual({ value: 'wis:save', label: 'Wisdom save' });
    expect(CHECK_OPTIONS).toContainEqual({ value: 'dex:tool:thieves-tools', label: "Thieves' Tools (Dex)" });
    expect(CHECK_OPTIONS).toHaveLength(6 + 18 + Object.keys(TOOLS).length + 6);
  });

  it('turns a choice into a check and back', () => {
    expect(checkOf('dex:sleight-of-hand')).toEqual({ ability: 'dex', skill: 'sleight-of-hand' });
    expect(checkOf('wis')).toEqual({ ability: 'wis' });
    expect(checkValue({ ability: 'str', skill: 'athletics' })).toBe('str:athletics');
    expect(checkValue({ ability: 'cha' })).toBe('cha');
    expect(checkOf('con:save')).toEqual({ ability: 'con', save: true });
    expect(checkValue({ ability: 'con', save: true })).toBe('con:save');
    expect(checkOf('dex:tool:thieves-tools')).toEqual({ ability: 'dex', tool: 'thieves-tools' });
    expect(checkValue({ ability: 'dex', tool: 'thieves-tools' })).toBe('dex:tool:thieves-tools');
  });

  it('reads a check named in text', () => {
    expect(checkNamed('Perception')).toEqual({ ability: 'wis', skill: 'perception' });
    expect(checkNamed('animal handling')).toEqual({ ability: 'wis', skill: 'animal-handling' });
    expect(checkNamed('dex')).toEqual({ ability: 'dex' });
    expect(checkNamed('Strength')).toEqual({ ability: 'str' });
    expect(checkNamed('luck')).toBeUndefined();
  });

  it('asks the selected creatures, else the party', () => {
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c', monster: 'goblin' }];
    expect(
      askedOf(
        all,
        (id) => id === 'c',
        () => true,
      ).map((t) => t.id),
    ).toEqual(['c']);
    expect(
      askedOf(
        all,
        () => false,
        () => true,
      ).map((t) => t.id),
    ).toEqual(['a', 'b']);
  });
});

describe("the game's own skills", () => {
  const psychic = { id: 'psychic-resistance', kind: 'skill', name: 'Psychic Resistance' };
  const content = contentWith('2014', gameCompendia({}, [], [psychic]));

  it('can be asked for, with Wisdom by default', () => {
    expect(checkOptions(content)).toContainEqual({
      value: 'wis:psychic-resistance',
      label: 'Psychic Resistance (Wis)',
    });
  });

  it('are found by name in text', () => {
    expect(checkNamed('psychic resistance', content)).toEqual({ ability: 'wis', skill: 'psychic-resistance' });
    expect(checkNamed('psychic resistance')).toBeUndefined();
  });
});
