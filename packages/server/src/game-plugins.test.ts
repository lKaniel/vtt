import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './game-store.ts';
import { PluginStore } from './plugin-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// A game's plugins at the table: every client is told what to load, and
// the GM lists the installed ones and turns them on (game.json `plugins`).

let dir: string;
let pluginDir: string;
let store: GameStore;
let game: Game;

async function put(root: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), JSON.stringify(data));
}

async function start(plugins?: string[]): Promise<void> {
  if (plugins) {
    const file = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as object;
    await put(dir, 'game.json', { ...file, plugins });
  }
  store = new GameStore(dir);
  store.plugins = new PluginStore(pluginDir);
  await store.plugins.load();
  await store.load();
  game = new Game(store);
}

beforeEach(async () => {
  dir = await makeWorld();
  pluginDir = await mkdtemp(join(tmpdir(), 'vtt-plugins-'));
  await put(pluginDir, 'turn-alert/plugin.json', { id: 'turn-alert', name: 'Turn alert' });
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

describe('plugins at the table', () => {
  it('are loaded by everyone at a game that turned them on', async () => {
    await start(['turn-alert']);
    expect(seat('ana').take('welcome')[0]?.plugins).toEqual([
      { id: 'turn-alert', name: 'Turn alert', main: '/plugins/turn-alert/main.js', styles: [] },
    ]);
  });

  it('are listed for the GM, who turns them on for the game', async () => {
    await start();
    const gm = seat('gm');
    const ana = seat('ana');
    expect(ana.take('welcome')[0]?.plugins).toEqual([]);
    gm.sent = [];
    gm.receive({ t: 'plugins' });
    await new Promise((done) => setTimeout(done, 20));
    expect(gm.take('plugins')[0]).toMatchObject({ plugins: [{ id: 'turn-alert', enabled: false }], problems: [] });
    const rev = store.docs.get('game', store.campaign.id)!.rev;
    gm.receive({
      t: 'ops',
      txn: 't',
      ops: [{ op: 'update', coll: 'game', id: store.campaign.id, rev, patch: { plugins: ['turn-alert'] } }],
    });
    expect(ana.take('welcome').at(-1)?.plugins).toEqual([expect.objectContaining({ id: 'turn-alert' })]);
  });

  it('are not listed for a player', async () => {
    await start();
    const ana = seat('ana');
    ana.sent = [];
    ana.receive({ t: 'plugins' });
    await new Promise((done) => setTimeout(done, 20));
    expect(ana.take('error')[0]?.message).toBe('Only the GM can manage plugins');
  });
});
