import { describe, expect, it } from 'vitest';
import { faceScale, onlookerOf } from './token-face.ts';

describe('a token’s face', () => {
  it('fits its picture to the square, then scales and mirrors it', () => {
    expect(faceScale({}, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(faceScale({ scale: 2, mirrorX: true }, 0.5)).toEqual({ x: -1, y: 1 });
  });

  it('knows how you stand to it: owner, selected, hovered', () => {
    const session = {
      you: { id: 'p1', name: 'P', role: 'player' as const, color: '#fff' },
      isSelected: (id: string) => id === 'a',
    };
    const mine = { id: 'a', ownership: { default: 'none' as const, p1: 'owner' as const } };
    expect(onlookerOf(session, mine, false)).toEqual({ owner: true, controlled: true, hovered: false });
    expect(onlookerOf(session, { id: 'b' }, true)).toEqual({ owner: false, controlled: false, hovered: true });
    const gm = { ...session, you: { ...session.you, role: 'gm' as const } };
    expect(onlookerOf(gm, { id: 'b' }, false).owner).toBe(true);
  });
});
