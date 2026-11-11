import { describe, expect, it } from 'vitest';
import {
  canControl,
  canEdit,
  canObserve,
  canOverride,
  canSee,
  isParty,
  levelOf,
  lockedPatchKeys,
  NO_SENSES,
  ownersOf,
  type PlacedToken,
  type Point,
  type Player,
  PlayerSchema,
  tokensVisibleTo,
  type Wall,
  withLevel,
} from './index.ts';

const player = (id: string, role: Player['role']): Player => PlayerSchema.parse({ id, name: id, role });
const gm = player('gm', 'gm');
const ana = player('ana', 'player');
const tess = player('tess', 'trusted');
const otto = player('otto', 'observer');
const bo = player('bo', 'player');

type Tok = PlacedToken & { darkvision?: number };
const token = (id: string, more: Partial<Tok> = {}): Tok => ({ id, x: 0, y: 0, ...more });
const perceiver = (t: Tok) => ({
  senses: { ...NO_SENSES, darkvision: t.darkvision ?? 0 },
  blinded: false,
  invisible: false,
});
const hero = token('hero', { ownership: { default: 'limited', ana: 'owner', tess: 'owner', otto: 'owner' } });
const scout = token('scout', { ownership: { default: 'limited', ana: 'owner', bo: 'observer' } });
const goblin = token('goblin');

describe('ownership levels', () => {
  it('are owner for the GM, else the level the document gives the player, else its default', () => {
    expect(levelOf(scout, gm)).toBe('owner');
    expect(levelOf(scout, ana)).toBe('owner');
    expect(levelOf(scout, bo)).toBe('observer');
    expect(levelOf(scout, tess)).toBe('limited');
  });

  it('are limited on a document that says nothing: seen, not read', () => {
    expect(levelOf(goblin, ana)).toBe('limited');
    expect(levelOf({ ownership: { default: 'none' } }, ana)).toBe('none');
  });

  it('never go above observer for an observer seat', () => {
    expect(levelOf(hero, otto)).toBe('observer');
    expect(canControl(hero, otto)).toBe(false);
  });

  it('give observer seats a look at the whole party', () => {
    expect(levelOf(scout, otto)).toBe('observer');
    expect(levelOf(goblin, otto)).toBe('limited');
  });

  it('let observers read the sheet but not act', () => {
    expect(canObserve(scout, bo)).toBe(true);
    expect(canControl(scout, bo)).toBe(false);
    expect(canObserve(goblin, bo)).toBe(false);
  });

  it('make a document the party’s when any player owns it', () => {
    expect(isParty(hero)).toBe(true);
    expect(isParty(goblin)).toBe(false);
    expect(isParty({ ownership: { default: 'owner' } })).toBe(true);
    expect(ownersOf(scout)).toEqual(['ana']);
  });
});

describe('seeing a document', () => {
  it('is for players with at least limited, never for hidden ones, and always for the GM', () => {
    expect(canSee(goblin, ana)).toBe(true);
    expect(canSee(token('secret', { ownership: { default: 'none', ana: 'limited' } }), bo)).toBe(false);
    expect(canSee(token('secret', { ownership: { default: 'none', ana: 'limited' } }), ana)).toBe(true);
    expect(canSee(token('lurker', { hidden: true }), ana)).toBe(false);
    expect(canSee(token('lurker', { hidden: true }), gm)).toBe(true);
  });

  it('hides illusions from players they were not woven for', () => {
    const ghost = token('ghost', { visibleTo: ['ana'] });
    expect(canSee(ghost, gm)).toBe(true);
    expect(canSee(ghost, ana)).toBe(true);
    expect(canSee(ghost, bo)).toBe(false);
  });
});

describe('editing a document', () => {
  it('is for the GM, and for any player on what they own', () => {
    expect(canEdit(hero, gm)).toBe(true);
    expect(canEdit(hero, tess)).toBe(true);
    expect(canEdit(scout, tess)).toBe(false);
    expect(canEdit(hero, ana)).toBe(true);
    expect(canEdit(scout, ana)).toBe(true);
    expect(canEdit(hero, otto)).toBe(false);
  });

  it('keeps who owns it, where it stands and whether it hides for the GM', () => {
    const patch = { name: 'X', hp: 3, ownership: { default: 'none' }, x: 5, hidden: true, actor: 'y', linked: false };
    expect(lockedPatchKeys(patch, gm)).toEqual([]);
    expect(lockedPatchKeys(patch, tess)).toEqual(['ownership', 'x', 'hidden', 'actor', 'linked']);
  });

  it('keeps how big a token is and what it sees for the GM, and the fields its system names; its picture is the owner’s', () => {
    const patch = { name: 'X', img: 'a.webp', size: 3, darkvision: 60, light: {}, monster: 'lich' };
    expect(lockedPatchKeys(patch, ana)).toEqual(['size', 'darkvision', 'light']);
    expect(lockedPatchKeys(patch, ana, ['monster'])).toEqual(['size', 'darkvision', 'light', 'monster']);
    expect(lockedPatchKeys(patch, gm, ['monster'])).toEqual([]);
  });

  it('lets a trusted player change how their creature is built and sees, never where it stands or who owns it', () => {
    const patch = { size: 3, darkvision: 60, light: {}, elevation: 30, filter: 'ghost', monster: 'lich', x: 5 };
    expect(lockedPatchKeys(patch, tess, ['monster'])).toEqual(['monster', 'x']);
  });

  it('lets the GM, and a trusted player on what they control, override the rules of a turn', () => {
    expect(canOverride(hero, gm)).toBe(true);
    expect(canOverride(goblin, gm)).toBe(true);
    expect(canOverride(hero, tess)).toBe(true);
    expect(canOverride(scout, tess)).toBe(false);
    expect(canOverride(hero, ana)).toBe(false);
    expect(canOverride(hero, otto)).toBe(false);
  });

  it('sets one player’s level, keeping the default', () => {
    expect(withLevel(scout.ownership, 'bo', 'owner')).toEqual({ default: 'limited', ana: 'owner', bo: 'owner' });
    expect(withLevel(scout.ownership, 'ana', 'none')).toEqual({ default: 'limited', ana: 'none', bo: 'observer' });
    expect(withLevel(undefined, 'ana', 'owner')).toEqual({ default: 'limited', ana: 'owner' });
    expect(withLevel({ default: 'limited', ana: 'owner' }, 'ana', 'limited')).toEqual({ default: 'limited' });
  });
});

describe('tokens on the map', () => {
  // As in Foundry: ownership decides who reads a creature's sheet, not
  // whether its token shows. Only hiding, illusions and sight keep it away.
  const lit = { world: { darkness: 0, vision: true, gridSize: 100 }, lights: [], wallsBetween: () => [], perceiver };
  const eye = token('eye', { ownership: { default: 'limited', bo: 'owner' } });
  const trader = token('trader', { x: 200, ownership: { default: 'none' } });

  it('show a creature nobody may read to players who see it', () => {
    expect(tokensVisibleTo(bo, [eye, trader], lit)).toEqual(new Set(['eye', 'trader']));
    expect(tokensVisibleTo(ana, [eye, trader], { ...lit, world: { ...lit.world, vision: false } })).toEqual(
      new Set(['eye', 'trader']),
    );
  });

  it('still keep hidden ones and illusions woven for others away', () => {
    const lurker = token('lurker', { x: 200, hidden: true, ownership: { default: 'none' } });
    const ghost = token('ghost', { x: 300, visibleTo: ['ana'] });
    expect(tokensVisibleTo(bo, [eye, lurker, ghost], lit)).toEqual(new Set(['eye']));
  });
});

describe('creatures that hide', () => {
  type Hider = Tok & { concealed?: number; notices?: number };
  const sneaky = (t: Hider) => ({ ...perceiver(t), concealed: t.concealed, notices: () => t.notices ?? 10 });
  const lit = {
    world: { darkness: 0, vision: true, gridSize: 100 },
    lights: [],
    wallsBetween: () => [],
    perceiver: sneaky,
  };
  const lookout = (notices: number): Hider => ({
    ...token('lookout', { ownership: { default: 'limited', bo: 'owner' } }),
    notices,
  });
  const lurker: Hider = { ...token('lurker', { x: 200 }), concealed: 15 };

  it('drop out of the view of players whose creatures do not notice them', () => {
    expect(tokensVisibleTo(bo, [lookout(12), lurker], lit)).toEqual(new Set(['lookout']));
  });

  it('show to a player one of whose creatures notices them', () => {
    expect(tokensVisibleTo(bo, [lookout(15), lurker], lit)).toEqual(new Set(['lookout', 'lurker']));
  });

  it('stay in view of the party they belong to, and of the GM', () => {
    const rogue: Hider = {
      ...token('rogue', { x: 200, ownership: { default: 'limited', ana: 'owner' } }),
      concealed: 25,
    };
    expect(tokensVisibleTo(bo, [lookout(10), rogue], lit)).toEqual(new Set(['lookout', 'rogue']));
    expect(tokensVisibleTo(gm, [lookout(10), lurker], lit)).toEqual(new Set(['lookout', 'lurker']));
  });
});

describe('what observers see', () => {
  it('lets a token observer see through its eyes', () => {
    const dark = { world: { darkness: 1, vision: true, gridSize: 100 }, lights: [], wallsBetween: () => [], perceiver };
    const lookout = token('lookout', { darkvision: 60, ownership: { default: 'limited', bo: 'observer' } });
    const far = token('far', { x: 300 });
    expect(tokensVisibleTo(bo, [lookout, far], dark)).toEqual(new Set(['lookout', 'far']));
    expect(tokensVisibleTo(ana, [lookout, far], dark)).toEqual(new Set());
  });

  it("see only what is on the viewer's level, past walls and in lights on other levels", () => {
    const levels = [
      { id: 'ground', name: 'Ground', bottom: 0 },
      { id: 'loft', name: 'Loft', bottom: 10 },
    ];
    const wall = { id: 'w', a: [50, -50], b: [50, 50], level: 'loft' } as Wall;
    const lamp = { x: 200, y: 0, bright: 20, dim: 0, level: 'loft' };
    const ctx = {
      world: { darkness: 1, vision: true, gridSize: 100 },
      lights: [lamp],
      wallsBetween: () => [wall],
      perceiver,
      levels,
    };
    const upstairs = token('upstairs', { x: 200, elevation: 10 });
    const below = token('below', { x: 200 });
    // On the ground: the loft's wall and lamp are not there, and the loft's goblin is out of sight.
    expect(
      tokensVisibleTo(bo, [token('eye', { ownership: { default: 'limited', bo: 'owner' } }), upstairs, below], ctx),
    ).toEqual(new Set(['eye']));
    // In the loft: the wall stands between.
    const up = token('eye', { elevation: 12, ownership: { default: 'limited', bo: 'owner' } });
    expect(tokensVisibleTo(bo, [up, upstairs, below], ctx)).toEqual(new Set(['eye']));
    // In the loft, east of the wall: the lamp lights the goblin up there, not the one below.
    const east = { ...up, x: 100 };
    expect(tokensVisibleTo(bo, [east, upstairs, below], ctx)).toEqual(new Set(['eye', 'upstairs']));
  });

  it('see creatures on a level their own looks down on, in that level’s light', () => {
    const levels = [
      { id: 'ground', name: 'Ground', bottom: 0 },
      { id: 'gallery', name: 'Gallery', bottom: 10, sees: ['ground'] },
    ];
    const torch = { x: 200, y: 0, bright: 20, dim: 0, level: 'ground' };
    const ctx = {
      world: { darkness: 1, vision: true, gridSize: 100 },
      lights: [torch],
      wallsBetween: () => [],
      perceiver,
      levels,
    };
    const below = token('below', { x: 200 });
    const onGallery = token('eye', { elevation: 10, ownership: { default: 'limited', bo: 'owner' } });
    expect(tokensVisibleTo(bo, [onGallery, below], ctx)).toEqual(new Set(['eye', 'below']));
    // From the ground the gallery isn't seen.
    const upThere = token('up', { x: 200, elevation: 10, light: { bright: 20, dim: 0 } });
    const onGround = token('eye', { ownership: { default: 'limited', bo: 'owner' } });
    expect(tokensVisibleTo(bo, [onGround, upThere], ctx)).toEqual(new Set(['eye']));
  });

  it('do not see creatures in a dark room by daylight, only those in its lamplight', () => {
    const day = { darkness: 0, vision: true, gridSize: 100 };
    const indoors = (level: string | undefined) => (p: Point) => level === undefined && p[0] >= 300;
    const lamp = { x: 600, y: 0, bright: 10, dim: 0 };
    const ctx = { world: day, lights: [lamp], wallsBetween: () => [], perceiver, indoors };
    const eye = token('eye', { ownership: { default: 'limited', bo: 'owner' } });
    const inDark = token('dark', { x: 300 });
    const inLamp = token('lamp', { x: 600 });
    const outside = token('out', { x: 200 });
    expect(tokensVisibleTo(bo, [eye, inDark, inLamp, outside], ctx)).toEqual(new Set(['eye', 'lamp', 'out']));
  });
});
