import { FogMap, rasterCircle, type ServerMessage } from '@vtt/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const sceneDoc = (id: string, sort: string) => ({ type: 'scene', id, rev: 1, name: id.toUpperCase(), sort });

const gmWelcome = (): ServerMessage => ({
  ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>),
  you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
  players: [
    { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    { id: 'ana', name: 'Ana', role: 'player', color: '#f00', scene: 'cellar' },
  ],
  docs: { scenes: [sceneDoc('main', 'a'), sceneDoc('cellar', 'b')] },
});

const sent = () => ws.sent.at(-1) as Record<string, unknown>;

describe('scenes in the client', () => {
  it('knows the scene it is on and the one the game is on', () => {
    ws.receive({ ...(welcome() as Extract<ServerMessage, { t: 'welcome' }>), scene: 'cellar', sceneName: 'Cellar' });
    expect([session.scene, session.activeScene, session.sceneName]).toEqual(['cellar', 'main', 'Cellar']);
  });

  it('lists the scenes for the GM, with who is on each', () => {
    ws.receive(gmWelcome());
    expect(session.sceneList().map((d) => d.id)).toEqual(['main', 'cellar']);
    expect(session.seatsOn('cellar').map((p) => p.id)).toEqual(['ana']);
    expect(session.seatsOn('main').map((p) => p.id)).toEqual(['gm']);
  });

  it('sends the scene moves', () => {
    ws.receive(gmWelcome());
    session.viewScene('cellar');
    expect(sent()).toEqual({ t: 'viewScene', scene: 'cellar' });
    session.activateScene('cellar');
    expect(sent()).toEqual({ t: 'activateScene', scene: 'cellar' });
    session.sendPlayer('ana');
    expect(sent()).toEqual({ t: 'sendPlayer', player: 'ana' });
  });

  it('makes, copies, edits and deletes scenes as ops', () => {
    ws.receive(gmWelcome());
    session.createScene('Goblin cave');
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'create', coll: 'scenes', doc: { id: 'goblin-cave' } }] });
    session.duplicateScene('cellar');
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'create', doc: { id: 'cellar-copy' } }] });
    session.editScene('cellar', { darkness: 0.5 });
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'update', id: 'cellar', patch: { darkness: 0.5 } }] });
    session.deleteScene('cellar');
    expect(sent()).toMatchObject({ t: 'ops', label: 'scene delete', ops: [{ op: 'delete', id: 'cellar' }] });
  });
});

describe('fog of war in the client', () => {
  const fogMessage = (player: string, at: [number, number], full = false): ServerMessage => {
    const map = new FogMap(25);
    const keys = map.add(rasterCircle(at, 60, 25));
    return { t: 'fog', player, ...map.encode(keys), ...(full ? { full } : {}) };
  };

  it('keeps what the server says was explored, per player', () => {
    ws.receive(welcome());
    ws.receive(fogMessage('ana', [100, 100], true));
    ws.receive(fogMessage('ana', [5000, 100]));
    const fog = session.fogOf('ana')!;
    expect(fog.explored([100, 100])).toBe(true);
    expect(fog.explored([5000, 100])).toBe(true);
    ws.receive(fogMessage('ana', [9000, 9000], true));
    expect(session.fogOf('ana')!.explored([100, 100])).toBe(false);
  });

  it('starts over on a new welcome', () => {
    ws.receive(welcome());
    ws.receive(fogMessage('ana', [100, 100], true));
    ws.receive(welcome());
    expect(session.fogOf('ana')).toBeUndefined();
  });

  it('sends the GM’s brush strokes and resets for the players picked', () => {
    ws.receive(gmWelcome());
    session.setFogBrush('reveal');
    session.setFogPlayers(['ana']);
    session.brushFog([
      [300, 300],
      [400, 300],
    ]);
    const edit = {
      op: 'reveal',
      path: [
        [300, 300],
        [400, 300],
      ],
      radius: 200,
      players: ['ana'],
    };
    expect(sent()).toEqual({ t: 'fog', edit });
    session.setFogBrushSize(1);
    expect(session.fogBrushRadius()).toBe(100);
    session.setFogPlayers(undefined);
    session.resetFog();
    expect(sent()).toEqual({ t: 'fog', edit: { op: 'reset' } });
  });
});
