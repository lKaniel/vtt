import { describe, expect, it } from 'vitest';
import { AnimationChoiceSchema, isMediaAnimation } from './index.ts';

describe('animation choices', () => {
  it('takes a library animation or a video from a pack or the game assets', () => {
    expect(AnimationChoiceSchema.safeParse('frost-orb').success).toBe(true);
    expect(AnimationChoiceSchema.safeParse('pack://jb2a/media/Fire_Bolt/a_30ft.webm').success).toBe(true);
    expect(AnimationChoiceSchema.safeParse('/assets/uploads/boom.webm').success).toBe(true);
    expect(AnimationChoiceSchema.safeParse('pack://jb2a/media/picture.png').success).toBe(false);
    expect(AnimationChoiceSchema.safeParse('https://example.com/a.webm').success).toBe(false);
    expect(isMediaAnimation('pack://jb2a/a.webm')).toBe(true);
    expect(isMediaAnimation('frost-orb')).toBe(false);
  });
});
