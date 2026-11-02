import { describe, expect, it } from 'vitest';
import { CHECK_OPTIONS, checkOf, checkValue } from './check-text.ts';

describe('check choices', () => {
  it('lists the six abilities, then every skill under its ability', () => {
    expect(CHECK_OPTIONS.slice(0, 2)).toEqual([
      { value: 'str', label: 'Strength' },
      { value: 'dex', label: 'Dexterity' },
    ]);
    expect(CHECK_OPTIONS).toContainEqual({ value: 'dex:stealth', label: 'Stealth (Dex)' });
    expect(CHECK_OPTIONS).toHaveLength(6 + 18);
  });

  it('turns a choice into a check and back', () => {
    expect(checkOf('dex:sleight-of-hand')).toEqual({ ability: 'dex', skill: 'sleight-of-hand' });
    expect(checkOf('wis')).toEqual({ ability: 'wis' });
    expect(checkValue({ ability: 'str', skill: 'athletics' })).toBe('str:athletics');
    expect(checkValue({ ability: 'cha' })).toBe('cha');
  });
});
