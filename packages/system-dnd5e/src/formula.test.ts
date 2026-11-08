import { describe, expect, it } from 'vitest';
import { evaluate, formulaIssue } from './formula.ts';

// Cost formulas of homebrew class features: arithmetic over named numbers.

describe('formulas', () => {
  it('works out arithmetic with names', () => {
    expect(evaluate('base * senses * weight', { base: 1, senses: 2, weight: 1.5 })).toBe(3);
    expect(evaluate('2 * (weight + 1) - 0.5', { weight: 1 })).toBe(3.5);
    expect(evaluate('-weight / 4', { weight: 2 })).toBe(-0.5);
    expect(evaluate('7', {})).toBe(7);
  });

  it('takes a missing name as 0', () => {
    expect(evaluate('1 + nothing', {})).toBe(1);
  });

  it('says what is wrong with a bad formula', () => {
    expect(formulaIssue('2 * (weight')).toMatch(/\)/);
    expect(formulaIssue('2 ** 3')).toBeDefined();
    expect(formulaIssue('alert(1)')).toBeDefined();
    expect(formulaIssue('weight * 2')).toBeUndefined();
  });
});
