import { describe, expect, it } from 'vitest';
import { Builder } from './session-builder.ts';

describe('the in-game character builder', () => {
  it('opens the creator or a level up, and closes', () => {
    let changes = 0;
    const b = new Builder({ changed: () => changes++ });
    b.open({ mode: 'levelup', id: 'mira' });
    expect(b.current).toEqual({ mode: 'levelup', id: 'mira' });
    b.close();
    expect(b.current).toBeUndefined();
    expect(changes).toBe(2);
  });
});
