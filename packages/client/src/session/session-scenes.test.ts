import { FogMap, rasterCircle } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
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
    expect([session.scene, session.scenes.active, session.scenes.name]).toEqual(['cellar', 'main', 'Cellar']);
  });

  it('lists the scenes for the GM, with who is on each', () => {
    ws.receive(gmWelcome());
    expect(session.scenes.list().map((d) => d.id)).toEqual(['main', 'cellar']);
    expect(session.scenes.seatsOn('cellar').map((p) => p.id)).toEqual(['ana']);
    expect(session.scenes.seatsOn('main').map((p) => p.id)).toEqual(['gm']);
  });

  it('sends the scene moves', () => {
    ws.receive(gmWelcome());
    session.scenes.view('cellar');
    expect(sent()).toEqual({ t: 'viewScene', scene: 'cellar' });
    session.scenes.activate('cellar');
    expect(sent()).toEqual({ t: 'activateScene', scene: 'cellar' });
    session.scenes.sendPlayer('ana');
    expect(sent()).toEqual({ t: 'sendPlayer', player: 'ana' });
  });

  it('adds floors and takes one away with what was on it put on every floor, in one step', () => {
    const base = gmWelcome() as Extract<ServerMessage, { t: 'welcome' }>;
    const levels = [
      { id: 'ground', name: 'Ground', bottom: 0, top: 10 },
      { id: 'loft', name: 'Loft', bottom: 10, top: 20 },
    ];
    const scenes = [{ ...sceneDoc('main', 'a'), levels }];
    ws.receive({ ...base, docs: { scenes, 'main/tiles': [{ id: 'bed', type: 'tile', rev: 1, level: 'loft' }] } });
    session.scenes.addLevel('main');
    expect(sent()).toMatchObject({
      ops: [{ op: 'update', id: 'main', patch: { levels: [...levels, { id: 'floor-3', bottom: 20 }] } }],
    });
    session.scenes.editLevel('main', 'loft', { name: 'Attic' });
    const edited = (sent().ops as { patch: { levels: { name: string }[] } }[])[0]!.patch.levels;
    expect(edited.map((l) => l.name)).toEqual(['Ground', 'Attic', 'Floor 3']);
    session.levels.setView('loft');
    session.scenes.removeLevel('main', 'loft');
    expect(sent()).toMatchObject({
      label: 'scene settings',
      ops: [
        { op: 'update', coll: 'scenes', patch: { levels: [levels[0], { id: 'floor-3' }] } },
        { op: 'update', coll: 'main/tiles', id: 'bed', patch: { level: null } },
      ],
    });
  });

  it('makes, copies, edits and deletes scenes as ops', () => {
    ws.receive(gmWelcome());
    session.scenes.create('Goblin cave');
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'create', coll: 'scenes', doc: { id: 'goblin-cave' } }] });
    session.scenes.duplicate('cellar');
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'create', doc: { id: 'cellar-copy' } }] });
    session.scenes.edit('cellar', { darkness: 0.5 });
    expect(sent()).toMatchObject({ t: 'ops', ops: [{ op: 'update', id: 'cellar', patch: { darkness: 0.5 } }] });
    session.scenes.delete('cellar');
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
    const fog = session.fog.of('ana')!;
    expect(fog.explored([100, 100])).toBe(true);
    expect(fog.explored([5000, 100])).toBe(true);
    ws.receive(fogMessage('ana', [9000, 9000], true));
    expect(session.fog.of('ana')!.explored([100, 100])).toBe(false);
  });

  it('starts over on a new welcome', () => {
    ws.receive(welcome());
    ws.receive(fogMessage('ana', [100, 100], true));
    ws.receive(welcome());
    expect(session.fog.of('ana')).toBeUndefined();
  });

  it('sends the GM’s brush strokes and resets for the players picked', () => {
    ws.receive(gmWelcome());
    session.fog.setBrush('reveal');
    session.fog.setPlayers(['ana']);
    session.fog.paint([
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
    session.fog.setBrushSize(1);
    expect(session.fog.radius()).toBe(100);
    session.fog.setPlayers(undefined);
    session.fog.reset();
    expect(sent()).toEqual({ t: 'fog', edit: { op: 'reset' } });
  });
});
