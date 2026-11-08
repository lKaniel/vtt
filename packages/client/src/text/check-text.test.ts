import { TOOLS } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { askedOf, CHECK_OPTIONS, checkNamed, checkOf, checkValue } from './check-text.ts';

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
