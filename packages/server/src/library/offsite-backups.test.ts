import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameHub } from './game-hub.ts';
import { FolderStore } from './object-store.ts';
import { OffsiteBackups } from './offsite-backups.ts';
import { FakeSocket, makeWorld } from '../test/fixtures.ts';

let dataDir: string;
let hub: GameHub;
let store: FolderStore;

const kaniel = { id: 'kaniel', name: 'Kaniel', role: 'gm' as const, color: '#e0b040' };
const at = (iso: string) => Date.parse(iso);
const offsite = (keep?: number) => new OffsiteBackups({ store, hub, dataDir, keep, hour: 3 });

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  store = new FolderStore(await mkdtemp(join(tmpdir(), 'vtt-offsite-')));
  hub = new GameHub({ dataDir, home: await makeWorld(), watch: false });
  await hub.load();
  await writeFile(join(dataDir, 'sessions.json'), '{"secret":"tokens"}');
  await writeFile(join(dataDir, 'characters.json'), '[]');
});

afterEach(async () => {
  await hub.close();
});

describe('nightly backups off the server', () => {
  it('copy every game and the server files (not sessions or packs) as one night', async () => {
    const id = await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' }, kaniel);
    const night = await offsite().run(at('2026-11-10T03:30:00Z'));
    expect(night).toEqual({ night: '2026-11-10', games: [id, 'test'].sort((a, b) => a.localeCompare(b)) });
    expect(await store.list('nights/')).toEqual([
      'nights/2026-11-10/done.json',
      `nights/2026-11-10/games/${id}.json`,
      'nights/2026-11-10/games/test.json',
      'nights/2026-11-10/server.json',
    ]);
    const server = (await store.get('nights/2026-11-10/server.json'))!.toString();
    expect(server).toContain('characters.json');
    expect(server).not.toContain('sessions.json');
    expect(server).not.toContain('games/');
  });

  it('upload each file once: a night with nothing changed adds nothing but its lists', async () => {
    const backups = offsite();
    await backups.run(at('2026-11-09T04:00:00Z'));
    const blobs = await store.list('blobs/');
    expect(blobs.length).toBeGreaterThan(3);
    await backups.run(at('2026-11-10T04:00:00Z'));
    expect(await store.list('blobs/')).toEqual(blobs);
    await writeFile(join(hub.dirOf('test')!, 'scenes/main/walls.json'), '[{"new":true}]');
    await backups.run(at('2026-11-11T04:00:00Z'));
    expect(await store.list('blobs/')).toHaveLength(blobs.length + 1);
  });

  it('copy a server whose data folder has nothing of its own yet', async () => {
    const backups = new OffsiteBackups({ store, hub, dataDir: join(dataDir, 'not-made-yet') });
    expect((await backups.run(at('2026-11-10T04:00:00Z'))).games).toEqual(['test']);
  });

  it('run once a night, after the hour, and remember that across restarts', async () => {
    const first = offsite();
    expect(first.due(at('2026-11-10T02:59:00Z'))).toBe(false);
    expect(first.due(at('2026-11-10T03:01:00Z'))).toBe(true);
    await first.run(at('2026-11-10T03:01:00Z'));
    expect(first.due(at('2026-11-10T23:00:00Z'))).toBe(false);
    const again = offsite();
    await again.load();
    expect(again.due(at('2026-11-10T23:00:00Z'))).toBe(false);
    expect(again.due(at('2026-11-11T03:01:00Z'))).toBe(true);
    expect(again.status()).toMatchObject({ target: store.describe(), lastRun: { night: '2026-11-10' } });
  });

  it('keep only the newest nights', async () => {
    const backups = offsite(2);
    const walls = join(hub.dirOf('test')!, 'scenes/main/walls.json');
    for (const day of ['08', '09', '10']) {
      await writeFile(walls, JSON.stringify([{ day }]));
      await backups.run(at(`2026-11-${day}T04:00:00Z`));
    }
    expect((await backups.nights()).map((n) => n.night)).toEqual(['2026-11-10', '2026-11-09']);
    expect(await store.list('nights/2026-11-08/')).toEqual([]);
    const kept = await Promise.all((await store.list('blobs/')).map(async (k) => (await store.get(k))!.toString()));
    expect(kept).not.toContain(JSON.stringify([{ day: '08' }]));
    expect(kept).toContain(JSON.stringify([{ day: '09' }]));
  });

  it('list only nights that finished, newest first, with their games', async () => {
    const backups = offsite();
    await backups.run(at('2026-11-09T04:00:00Z'));
    await store.put('nights/2026-11-10/games/test.json', Buffer.from('{"files":[]}'));
    expect(await backups.nights()).toEqual([{ night: '2026-11-09', games: ['test'] }]);
  });

  it('say what went wrong when a night fails', async () => {
    const broken = Object.assign(new FolderStore(dataDir), {
      put: () => Promise.reject(new Error('Backup storage said 403: wrong key')),
    });
    const backups = new OffsiteBackups({ store: broken, hub, dataDir });
    await expect(backups.run(at('2026-11-10T04:00:00Z'))).rejects.toThrow();
    expect(backups.status().lastError?.message).toMatch(/403/);
    expect(backups.status().lastRun).toBeUndefined();
  });

  it('put a game back as it was that night, sending its players away first', async () => {
    const dir = hub.dirOf('test')!;
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(join(dir, 'assets/map.webp'), 'picture');
    const backups = offsite();
    await backups.run(at('2026-11-10T04:00:00Z'));
    const before = await readFile(join(dir, 'scenes/main/walls.json'), 'utf8');
    const running = await hub.open('test');
    const ws = new FakeSocket();
    hub.connect('test', ws.asWebSocket, running.store.world.players[0]!);
    await writeFile(join(dir, 'scenes/main/walls.json'), '[]');
    await rm(join(dir, 'assets'), { recursive: true });
    await writeFile(join(dir, 'stray.json'), '{}');
    await backups.restore('2026-11-10', 'test');
    expect(ws.readyState).toBe(3);
    expect(await readFile(join(dir, 'scenes/main/walls.json'), 'utf8')).toBe(before);
    expect(await readFile(join(dir, 'assets/map.webp'), 'utf8')).toBe('picture');
    await expect(readFile(join(dir, 'stray.json'))).rejects.toThrow();
    expect((await hub.backups.list('test')).map((b) => b.reason)).toContain('restore');
  });

  it('bring back a game deleted since', async () => {
    const id = await hub.create({ name: 'Lost Mine', system: 'dnd5e', rules: '2014' }, kaniel);
    const backups = offsite();
    await backups.run(at('2026-11-10T04:00:00Z'));
    await hub.remove(id);
    await backups.restore('2026-11-10', id);
    expect(hub.has(id)).toBe(true);
    expect((await hub.info(id)).name).toBe('Lost Mine');
  });

  it('refuse a night or game that is not there', async () => {
    await expect(offsite().restore('2026-11-10', 'test')).rejects.toThrow(/No such backup/);
    await expect(offsite().restore('../x', 'test')).rejects.toThrow(/No such backup/);
  });
});
