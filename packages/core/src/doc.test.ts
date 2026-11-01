import { describe, expect, it } from 'vitest';
import { PlaceableSchema, levelFor, OwnershipSchema } from './doc.ts';

describe('PlaceableSchema', () => {
  it('fills defaults for a placeable', () => {
    const wall = PlaceableSchema.parse({ id: 'wall-1', type: 'wall', scene: 'crossroads', x: 100, y: 200, a: [0, 0] });
    expect(wall).toMatchObject({ rev: 0, elevation: 0, hidden: false, locked: false, a: [0, 0] });
  });

  it('needs a scene and a position', () => {
    expect(PlaceableSchema.safeParse({ id: 'wall-1', type: 'wall', x: 0, y: 0 }).success).toBe(false);
    expect(PlaceableSchema.safeParse({ id: 'wall-1', type: 'wall', scene: 's' }).success).toBe(false);
  });
});

describe('ownership', () => {
  const ownership = OwnershipSchema.parse({ default: 'limited', kaniel: 'owner' });

  it('gives a named account its own level and everyone else the default', () => {
    expect(levelFor(ownership, 'kaniel')).toBe('owner');
    expect(levelFor(ownership, 'someone')).toBe('limited');
  });

  it('treats a document without ownership as unseen by players', () => {
    expect(levelFor(undefined, 'kaniel')).toBe('none');
  });

  it('rejects unknown levels', () => {
    expect(OwnershipSchema.safeParse({ default: 'god' }).success).toBe(false);
  });
});
