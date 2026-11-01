import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { FakeSocket, makeWorld, savedToken } from './test/fixtures.ts';
import { GameStore } from './game-store.ts';

let dir: string;
let store: GameStore;
let game: Game;

beforeEach(async () => {
  dir = await makeWorld();
  store = new GameStore(dir);
  await store.load();
  game = new Game(store);
});

afterEach(async () => {
  await store.flush();
});

function join_(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

describe('what players are told', () => {
  it('hides the goblin behind the closed door, but not from the GM', () => {
    const [ana] = join_('ana').take('welcome');
    expect(ana!.tokens.map((t) => t.id)).toEqual(['hero']);
    const [gm] = join_('gm').take('welcome');
    expect(gm!.tokens.map((t) => t.id).sort((a, b) => a.localeCompare(b))).toEqual(['goblin', 'hero']);
  });

  it('reveals the lit goblin once the door opens', () => {
    const ana = join_('ana');
    ana.take('welcome');
    ana.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(ana.sent.find((m) => m.t === 'token')).toMatchObject({ token: { id: 'goblin' } });
  });
});

describe('moving', () => {
  it('walks a controlled token and saves it', async () => {
    const ana = join_('ana');
    ana.take('welcome');
    ana.receive({ t: 'move', token: 'hero', to: [50, 50] });
    const [moved] = ana.take('moved');
    expect(moved!.path.at(-1)).toEqual([50, 50]);
    await store.flush();
    expect(await savedToken(dir, 'hero')).toMatchObject({ x: 50, y: 50 });
  });

  it('walks to the exact point when the scene has no grid', () => {
    const ana = join_('ana');
    ana.receive({ t: 'move', token: 'hero', to: [137, 62] });
    expect(ana.take('moved')[0]!.path.at(-1)).toEqual([137, 62]);
  });

  it('walks square to square when the scene has a grid', async () => {
    await writeFile(join(dir, 'scenes/main/scene.json'), JSON.stringify({ darkness: 1, grid: 'square' }));
    store = new GameStore(dir);
    await store.load();
    game = new Game(store);
    const ana = join_('ana');
    ana.receive({ t: 'move', token: 'hero', to: [137, 62] });
    expect(ana.take('moved')[0]!.path.at(-1)).toEqual([150, 50]);
  });

  it('never walks through or into another creature', () => {
    const gm = join_('gm');
    gm.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    gm.receive({ t: 'move', token: 'hero', to: [560, 160] });
    expect(gm.take('error')[0]!.message).toMatch(/can't get there/);
    gm.receive({ t: 'move', token: 'hero', to: [750, 150] });
    const path = gm.take('moved')[0]!.path;
    expect(path.at(-1)).toEqual([750, 150]);
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1]!, path[i]!];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(Math.hypot(mid[0]! - 550, mid[1]! - 150)).toBeGreaterThanOrEqual(99);
    }
  });

  it('refuses tokens you do not control or cannot reach', () => {
    const bo = join_('bo');
    bo.take('welcome');
    bo.receive({ t: 'move', token: 'hero', to: [50, 50] });
    expect(bo.take('error')[0]!.message).toMatch(/don't control/);
    const ana = join_('ana');
    ana.receive({ t: 'move', token: 'hero', to: [550, 150] });
    expect(ana.take('error')[0]!.message).toMatch(/can't get there/);
  });
});

describe('doors', () => {
  it('lets only the GM lock and unlock', () => {
    const ana = join_('ana');
    ana.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'locked' });
    expect(ana.take('error')[0]!.message).toMatch(/locked/);
    join_('gm').receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'locked' });
    expect(store.chunks.get('0_0')!.walls.find((w) => w.id === 'door')!.door).toBe('locked');
    ana.receive({ t: 'door', chunk: '0_0', wall: 'door', state: 'open' });
    expect(ana.take('error')[0]!.message).toMatch(/locked/);
  });
});

describe('chat', () => {
  it('sends text and rolls to everyone, GM rolls only to the GM and roller', () => {
    const ana = join_('ana');
    const bo = join_('bo');
    const gm = join_('gm');
    for (const ws of [ana, bo, gm]) ws.take('welcome');
    ana.receive({ t: 'chat', text: 'hello' });
    ana.receive({ t: 'chat', text: '/r 1d20+5' });
    ana.receive({ t: 'chat', text: '/gmr 1d4' });
    expect(bo.take('chat').map((m) => m.message.text ?? m.message.roll?.formula)).toEqual(['hello', '1d20+5']);
    expect(gm.take('chat')).toHaveLength(3);
    expect(ana.take('chat')).toHaveLength(3);
  });

  it('reports a bad formula to the sender only', () => {
    const ana = join_('ana');
    ana.take('welcome');
    ana.receive({ t: 'chat', text: '/r fireball' });
    expect(ana.take('error')).toHaveLength(1);
  });

  it('rejects malformed messages', () => {
    const ana = join_('ana');
    ana.take('welcome');
    ana.receive({ t: 'teleport' });
    expect(ana.take('error')[0]!.message).toBe('Bad message');
  });
});
