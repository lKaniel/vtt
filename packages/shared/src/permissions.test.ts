import { describe, expect, it } from 'vitest';
import {
  canControlToken,
  canEditToken,
  canObserveToken,
  lockedPatchKeys,
  ownershipOf,
  PlayerSchema,
  TokenSchema,
  tokensVisibleTo,
  type Player,
} from './index.ts';

const player = (id: string, role: Player['role']): Player => PlayerSchema.parse({ id, name: id, role });
const gm = player('gm', 'gm');
const ana = player('ana', 'player');
const tess = player('tess', 'trusted');
const otto = player('otto', 'observer');
const bo = player('bo', 'player');

const hero = TokenSchema.parse({ id: 'hero', name: 'Hero', x: 0, y: 0, controllers: ['ana', 'tess', 'otto'] });
const scout = TokenSchema.parse({ id: 'scout', name: 'Scout', x: 0, y: 0, controllers: ['ana'], observers: ['bo'] });

describe('ownership of a token', () => {
  it('is full for the GM, owner for controllers, observer for observers, else none', () => {
    expect(ownershipOf(scout, gm)).toBe('owner');
    expect(ownershipOf(scout, ana)).toBe('owner');
    expect(ownershipOf(scout, bo)).toBe('observer');
    expect(ownershipOf(scout, tess)).toBe('none');
  });

  it('never goes above observer for an observer seat', () => {
    expect(ownershipOf(hero, otto)).toBe('observer');
    expect(canControlToken(hero, otto)).toBe(false);
  });

  it('gives observer seats a look at the whole party', () => {
    expect(ownershipOf(scout, otto)).toBe('observer');
    const goblin = TokenSchema.parse({ id: 'goblin', name: 'Goblin', x: 0, y: 0 });
    expect(ownershipOf(goblin, otto)).toBe('none');
  });

  it('lets observers read the sheet but not act', () => {
    expect(canObserveToken(scout, bo)).toBe(true);
    expect(canControlToken(scout, bo)).toBe(false);
  });
});

describe('editing a token', () => {
  it('is for the GM, and for trusted players on tokens they own', () => {
    expect(canEditToken(hero, gm)).toBe(true);
    expect(canEditToken(hero, tess)).toBe(true);
    expect(canEditToken(scout, tess)).toBe(false);
    expect(canEditToken(hero, ana)).toBe(false);
    expect(canEditToken(hero, otto)).toBe(false);
  });

  it('keeps who owns it, where it stands and whether it hides for the GM', () => {
    const patch = {
      name: 'X',
      hp: 3,
      controllers: ['bo'],
      x: 5,
      hidden: true,
      observers: [],
      actor: 'y',
      linked: false,
    };
    expect(lockedPatchKeys(patch, gm)).toEqual([]);
    expect(lockedPatchKeys(patch, tess)).toEqual(['controllers', 'x', 'hidden', 'observers', 'actor', 'linked']);
  });
});

describe('what observers see', () => {
  it('lets a token observer see through its eyes', () => {
    const dark = { world: { darkness: 1, vision: true, gridSize: 100 }, lights: [], wallsBetween: () => [] };
    const lookout = TokenSchema.parse({
      id: 'lookout',
      name: 'Lookout',
      x: 0,
      y: 0,
      darkvision: 60,
      observers: ['bo'],
    });
    const goblin = TokenSchema.parse({ id: 'goblin', name: 'Goblin', x: 300, y: 0 });
    expect(tokensVisibleTo(bo, [lookout, goblin], dark)).toEqual(new Set(['lookout', 'goblin']));
    expect(tokensVisibleTo(ana, [lookout, goblin], dark)).toEqual(new Set());
  });
});
