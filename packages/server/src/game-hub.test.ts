import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameHub } from './game-hub.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

let dataDir: string;
let home: string;
let hub: GameHub;

const kaniel = { id: 'kaniel', name: 'Kaniel', role: 'gm' as const, color: '#e0b040' };

async function startHub(idleMs = 60_000): Promise<GameHub> {
  const h = new GameHub({ dataDir, home, idleMs, watch: false });
  await h.load();
  return h;
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  home = await makeWorld();
  hub = await startHub();
});

afterEach(async () => {
  await hub.close();
});

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

describe('the games on a server', () => {
  it('starts with the game folder the server was started with, open to every account', async () => {
    expect(hub.ids()).toEqual(['test']);
    expect(hub.homeId).toBe('test');
    expect(await hub.info('test')).toMatchObject({ id: 'test', name: 'Test', system: 'dnd5e', rules: '2014', open: true });
    expect(hub.isRunning('test')).toBe(false);
  });

  it('creates a game in its own folder, with its creator as GM and one empty scene', async () => {
    const id = await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2024' }, kaniel);
    expect(id).toBe('lost-mine');
    const dir = join(dataDir, 'games', 'lost-mine');
    const game = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as Record<string, unknown>;
    expect(game).toMatchObject({ id: 'lost-mine', name: 'Lost Mine', rules: '2024', system: 'dnd5e', format: 4 });
    expect(game.players).toEqual([kaniel]);
    const { store } = await hub.open(id);
    expect(store.sceneIds()).toEqual([game.scene]);
    expect(await hub.info(id)).toMatchObject({ open: false, players: [kaniel] });
    expect(await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' }, kaniel)).toBe('lost-mine-2');
  });

  it('refuses a game without a name or system', async () => {
    await expect(hub.create({ name: '', system: 'dnd5e', rules: '2014' }, kaniel)).rejects.toThrow(/name/);
  });

  it('finds the games made before, after a restart', async () => {
    const id = await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' }, kaniel);
    const code = await hub.invite(id);
    await hub.close();
    hub = await startHub();
    expect(hub.ids()).toEqual(['test', 'lost-mine']);
    expect(hub.byInvite(code)).toBe(id);
  });

  it('loads a game once for everyone, and unloads it when the last player has left', async () => {
    await hub.close();
    hub = await startHub(10);
    const [a, b] = await Promise.all([hub.open('test'), hub.open('test')]);
    expect(a).toBe(b);
    const ws = new FakeSocket();
    hub.connect('test', ws.asWebSocket, a.store.world.players[0]!);
    expect((await hub.info('test')).online).toEqual(['gm']);
    expect((await hub.info('test')).lastPlayed).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.isRunning('test')).toBe(true);
    ws.close();
    await new Promise((r) => setTimeout(r, 30));
    expect(hub.isRunning('test')).toBe(false);
  });

  it('changes who is in a game, cleaning up after a removed member', async () => {
    const { store } = await hub.open('test');
    await hub.setMembers('test', store.world.players.filter((p) => p.id !== 'bo'));
    expect((await hub.info('test')).players.map((p) => p.id)).toEqual(['gm', 'ana']);
  });

  it('renews invite links: the old one stops working', async () => {
    const first = await hub.invite('test');
    const second = await hub.invite('test');
    expect(first).not.toBe(second);
    expect(hub.byInvite(first)).toBeUndefined();
    expect(hub.byInvite(second)).toBe('test');
  });

  it('deletes a game made in the lobby, but never the one it was started with', async () => {
    const id = await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' }, kaniel);
    await hub.open(id);
    await hub.remove(id);
    expect(hub.ids()).toEqual(['test']);
    expect(await exists(join(dataDir, 'games', id))).toBe(false);
    await expect(hub.remove('test')).rejects.toThrow(/started with/);
    expect(await exists(join(home, 'game.json'))).toBe(true);
  });

  it('opens and closes a game to every account', async () => {
    await hub.setOpen('test', false);
    expect((await hub.info('test')).open).toBe(false);
  });
});
