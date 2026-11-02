import { TokenSchema, type TokenView } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aimPoint, dragsFreely, previewToken, walkOptions } from './walking.ts';
import { closeSession, openSession, token as placed, welcome } from '../session/session.fixtures.ts';
import type { Session } from '../session/session.ts';

const token = (data: object): TokenView => TokenSchema.parse({ id: 't', name: 'T', x: 150, y: 150, ...data });
const hero = token({ id: 'hero' });
const ogre = token({ id: 'ogre', x: 500, y: 500, size: 2 });
const upstairs = token({ id: 'bat', x: 300, y: 300, elevation: 10 });
const dead: TokenView = { ...token({ id: 'dead', x: 700, y: 100 }), health: 'down' };
const world = { gridSize: 100 };

describe('walking preview', () => {
  it('aims at the very point without a grid, at the square on one', () => {
    expect(aimPoint([137, 262], world)).toEqual([137, 262]);
    expect(aimPoint([137, 262], { ...world, grid: 'square' as const })).toEqual([150, 250]);
  });

  it('walks around the standing creatures on its level, as the server does', () => {
    const opts = walkOptions(world, hero, [hero, ogre, upstairs, dead]);
    expect(opts).toMatchObject({ gridSize: 100, gridless: true, radius: 50 });
    expect(opts.bodies).toEqual([{ x: 500, y: 500, r: 100 }]);
  });
});

describe('the GM dragging in the map editor', () => {
  it('moves tokens to any point without a grid, by squares on one', () => {
    expect(dragsFreely('tokens', world)).toBe(true);
    expect(dragsFreely('tokens', { ...world, grid: 'square' })).toBe(false);
    expect(dragsFreely('walls', world)).toBe(false);
    expect(dragsFreely('tokens', undefined)).toBe(false);
  });
});

describe('previewToken', () => {
  let session: Session;

  beforeEach(() => {
    const { session: s, ws } = openSession();
    session = s;
    ws.receive(welcome([placed('hero'), { ...placed('goblin', 550), ownership: undefined }]));
    session.select('hero');
  });

  afterEach(() => closeSession(session));

  const open = { hover: [350, 350] as [number, number], editing: false };

  it("shows your creature's walk while the pointer rests on open ground", () => {
    expect(previewToken(session, open)?.id).toBe('hero');
  });

  it('shows the walk up to a creature you hover, but nothing over one of your own', () => {
    expect(previewToken(session, { ...open, hover: [550, 50] })?.id).toBe('hero');
    expect(previewToken(session, { ...open, hover: [50, 50] })).toBeUndefined();
  });

  it('shows nothing while panning or pressing, or in another editor mode', () => {
    expect(previewToken(session, { ...open, drag: { token: false, panning: true } })).toBeUndefined();
    expect(previewToken(session, { ...open, drag: { token: false, panning: false } })).toBeUndefined();
    expect(previewToken(session, { ...open, editing: true })).toBeUndefined();
  });

  it('shows the path of a token being dragged', () => {
    expect(previewToken(session, { ...open, hover: [550, 50], drag: { token: true, panning: false } })?.id).toBe(
      'hero',
    );
  });
});
