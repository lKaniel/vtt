import { describe, expect, it } from 'vitest';
import { stepTarget } from './stepping.ts';

describe('walking with the arrow keys', () => {
  it('moves one square in the arrow’s direction', () => {
    const t = { x: 150, y: 150 };
    expect(stepTarget(t, 'step-right', 100)).toEqual([250, 150]);
    expect(stepTarget(t, 'step-up', 100)).toEqual([150, 50]);
    expect(stepTarget(t, 'step-left', 100)).toEqual([50, 150]);
    expect(stepTarget(t, 'step-down', 100)).toEqual([150, 250]);
    expect(stepTarget(t, 'a', 100)).toBeUndefined();
  });
});
