import { describe, expect, it } from 'vitest';
import { exhaustionText, hitDiceText } from './vigour-text.ts';

describe('exhaustion and hit dice on the sheet', () => {
  it('says what each level of exhaustion does in either edition', () => {
    expect(exhaustionText(0, '2014')).toBe('Not exhausted');
    expect(exhaustionText(3, '2014')).toBe('Disadvantage on checks · speed halved · disadvantage on attacks and saves');
    expect(exhaustionText(2, '2024')).toBe('−4 to d20 tests · −10 ft speed');
    expect(exhaustionText(6, '2024')).toBe('Dead');
  });

  it('counts hit dice left', () => {
    expect(hitDiceText({ die: 10, total: 3, left: 2 })).toBe('2/3 d10');
  });
});
