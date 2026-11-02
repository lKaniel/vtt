import type { Doc } from '@vtt/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { FakeSocket, makeTwoScenes } from './test/fixtures.ts';

// Tile triggers, like Monk's Active Tiles: clicking a tile (or walking onto
// it) runs its actions. The hero stands in the middle of the test room
// (150, 150), with a closed door east of them at x 300.

let store: GameStore;
let game: Game;

beforeEach(async () => {
  store = new GameStore(await makeTwoScenes());
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  ws.sent = [];
  return ws;
}

/** A lever in the room's north-west square (0-100). */
function tile(trigger: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  const doc = {
    id: 'lever',
    type: 'tile',
    rev: 0,
    kind: 'image',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    src: '/assets/lever-up.png',
    trigger,
    ...extra,
  } as Doc;
  store.applyOps([{ op: 'create', coll: 'main/tiles', doc }]);
}

const pull = (ws: FakeSocket, token?: string) => ws.receive({ t: 'trigger', tile: 'lever', ...(token && { token }) });
const errors = (ws: FakeSocket) => ws.take('error').map((e) => e.message);
const lever = () => store.docs.get('main/tiles', 'lever')!;

describe('clicking a trigger tile', () => {
  it('swaps its picture round, and the GM can undo it', () => {
    tile({ actions: [{ type: 'image', images: ['/assets/lever-up.png', '/assets/lever-down.png'] }] });
    const ana = seat('ana');
    pull(ana);
    expect(lever().src).toBe('/assets/lever-down.png');
    pull(ana);
    expect(lever().src).toBe('/assets/lever-up.png');
    pull(ana);
    seat('gm').receive({ t: 'undo' });
    expect(lever().src).toBe('/assets/lever-up.png');
  });

  it('opens a door, shows a hidden tile and hides a creature', () => {
    tile({
      actions: [
        { type: 'door', wall: 'door', to: 'toggle' },
        { type: 'visibility', target: { coll: 'tiles', id: 'chest' }, to: 'show' },
        { type: 'visibility', target: { coll: 'tokens', id: 'goblin' }, to: 'hide' },
      ],
    });
    const chest = { id: 'chest', type: 'tile', rev: 0, kind: 'image', x: 200, y: 0, w: 100, h: 100, src: '/c.png' };
    store.applyOps([{ op: 'create', coll: 'main/tiles', doc: { ...chest, hidden: true } }]);
    pull(seat('ana'));
    expect(store.chunks.get('0_0')!.walls.find((w) => w.id === 'door')!.door).toBe('open');
    expect(store.docs.get('main/tiles', 'chest')!.hidden).toBe(false);
    expect(store.tokens.get('goblin')!.hidden).toBe(true);
  });

  it('plays a sound for everyone on the scene, posts in chat and opens a journal entry', () => {
    const entry = { id: 'note', type: 'journal', rev: 0, name: 'Note', pages: [{ id: 'p1', name: 'Page' }] };
    store.applyOps([{ op: 'create', coll: 'journals', doc: entry }]);
    tile({
      actions: [
        { type: 'sound', src: '/assets/clunk.ogg', volume: 0.8 },
        { type: 'message', text: 'Something clunks.' },
        { type: 'journal', entry: 'note', page: 'p1' },
      ],
    });
    const bo = seat('bo');
    pull(seat('ana'));
    const got = bo.sent.filter((m) => m.t !== 'docs' && m.t !== 'history');
    expect(got).toEqual([
      { t: 'sound', src: '/assets/clunk.ogg', volume: 0.8 },
      { t: 'chat', message: expect.objectContaining({ text: 'Something clunks.' }) as unknown },
      { t: 'showJournal', entry: 'note', page: 'p1' },
    ]);
    expect(store.docs.get('journals', 'note')!.ownership).toEqual({ default: 'observer' });
  });

  it('teleports the creature you clicked with, and nobody without one', () => {
    tile({ actions: [{ type: 'teleport', to: [50, 250] }] });
    const ana = seat('ana');
    pull(ana);
    expect(store.tokens.get('hero')).toMatchObject({ x: 150, y: 150 });
    pull(ana, 'hero');
    expect(store.tokens.get('hero')).toMatchObject({ x: 50, y: 250 });
    pull(ana, 'goblin');
    expect(errors(ana)).toEqual(['No such token']);
  });

  it('runs once when meant to, and not when off, GM-only or hidden', () => {
    tile({ once: true, actions: [{ type: 'message', text: 'Click.' }] });
    const ana = seat('ana');
    pull(ana);
    pull(ana);
    expect(ana.take('chat')).toHaveLength(1);
    expect((lever().trigger as { disabled?: boolean }).disabled).toBe(true);

    store.applyOps([
      { op: 'update', coll: 'main/tiles', id: 'lever', patch: { trigger: { gmOnly: true, actions: [] } } },
    ]);
    pull(ana);
    store.applyOps([{ op: 'update', coll: 'main/tiles', id: 'lever', patch: { hidden: true } }]);
    pull(ana);
    expect(errors(ana)).toEqual(['Only the GM may use that', 'No such tile']);
  });

  it('runs a walk-onto tile when a creature steps on it, not when clicked', () => {
    tile({ on: 'enter', actions: [{ type: 'message', text: 'A plate sinks.' }] }, { x: 200, y: 100 });
    const ana = seat('ana');
    pull(ana);
    expect(errors(ana)).toEqual(['That tile is not clicked']);
    ana.receive({ t: 'move', token: 'hero', to: [250, 150] });
    expect(ana.take('chat').map((c) => c.message.text)).toEqual(['A plate sinks.']);
  });
});

describe('regions with trigger actions', () => {
  it('open a door when a creature walks in', () => {
    const points = [
      [200, 100],
      [300, 100],
      [300, 200],
      [200, 200],
    ];
    const region = {
      id: 'spot',
      type: 'region',
      rev: 0,
      points,
      behaviors: [{ type: 'door', wall: 'door', to: 'open' }],
    };
    store.applyOps([{ op: 'create', coll: 'main/regions', doc: region }]);
    seat('ana').receive({ t: 'move', token: 'hero', to: [250, 150] });
    expect(store.chunks.get('0_0')!.walls.find((w) => w.id === 'door')!.door).toBe('open');
  });
});
