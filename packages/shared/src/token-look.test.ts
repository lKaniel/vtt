import { describe, expect, it } from 'vitest';
import { TokenLookSchema, displays, lookTransform } from './token-look.ts';
import { z } from 'zod';

const seen = { owner: false, controlled: false, hovered: false };

describe('when a name or bar shows', () => {
  it('follows Foundry’s display modes; missing is always', () => {
    expect(displays(undefined, seen)).toBe(true);
    expect(displays('never', { owner: true, controlled: true, hovered: true })).toBe(false);
    expect(displays('control', { ...seen, owner: true })).toBe(false);
    expect(displays('control', { ...seen, owner: true, controlled: true })).toBe(true);
    expect(displays('ownerHover', { ...seen, hovered: true })).toBe(false);
    expect(displays('ownerHover', { ...seen, owner: true, hovered: true })).toBe(true);
    expect(displays('hover', { ...seen, hovered: true })).toBe(true);
    expect(displays('owner', { ...seen, owner: true })).toBe(true);
    expect(displays('owner', seen)).toBe(false);
  });
});

describe('a token’s look', () => {
  it('scales and mirrors its picture', () => {
    expect(lookTransform({})).toEqual({ x: 1, y: 1 });
    expect(lookTransform({ scale: 1.5, mirrorX: true })).toEqual({ x: -1.5, y: 1.5 });
    expect(lookTransform({ mirrorY: true })).toEqual({ x: 1, y: -1 });
  });

  it('checks its fields', () => {
    const look = z.object(TokenLookSchema);
    expect(look.safeParse({ displayBars: 'hover', scale: 2, ring: { color: '#e0b040' } }).success).toBe(true);
    expect(look.safeParse({ scale: 9 }).success).toBe(false);
    expect(look.safeParse({ displayName: 'sometimes' }).success).toBe(false);
  });
});
