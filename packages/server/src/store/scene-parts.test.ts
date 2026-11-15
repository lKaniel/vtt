import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Chunk } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { makeCombined } from '../test/fixtures.ts';
import { GameStore } from './game-store.ts';

async function city(): Promise<{ dir: string; store: GameStore }> {
  const dir = await makeCombined();
  const store = new GameStore(dir);
  await store.load();
  return { dir, store };
}

const abc = (a: string, b: string) => a.localeCompare(b);
const wallIds = (store: GameStore) => [...store.chunks.values()].flatMap((c) => c.walls.map((w) => w.id)).toSorted(abc);

describe('a combined scene', () => {
  it('holds its own map and every part laid at its place', async () => {
    const { store } = await city();
    store.inScene('city', () => {
      expect(wallIds(store)).toEqual(
        ['cellar--cw', 'main--door', 'main--e1', 'main--e2', 'main--n', 'main--s', 'main--w', 'own'].toSorted(abc),
      );
      expect([...store.chunks.keys()].toSorted(abc)).toEqual(['0_0', '0_2', '2_0']);
      expect(store.wallsBetween([4150, 150], [4550, 150]).map((w) => w.id)).toContain('main--door');
      expect(store.lights().map((l) => [l.x, l.y])).toEqual([[4550, 150]]);
      expect([...store.tokens.keys()]).toEqual(['guard']);
    });
    expect(store.inScene('main', () => wallIds(store))).toContain('door');
  });

  it('shows a change made in a part at once', async () => {
    const { store } = await city();
    const told: [string, string][] = [];
    store.on('chunk', (key, _chunk, scene) => told.push([scene, key]));
    store.inScene('main', () => {
      const chunk = store.chunks.get('0_0')!;
      const walls = chunk.walls.map((w) => (w.id === 'door' ? { ...w, door: 'open' as const } : w));
      store.setChunk('0_0', { ...chunk, walls });
    });
    expect(told.toSorted(([a], [b]) => abc(a, b))).toEqual([
      ['city', '2_0'],
      ['main', '0_0'],
    ]);
    const door = store.inScene('city', () => store.chunks.get('2_0')!.walls.find((w) => w.id === 'main--door'));
    expect(door).toMatchObject({ door: 'open', part: 'main', a: [4300, 100] });
  });

  it('saves a door opened on the whole in its part', async () => {
    const { dir, store } = await city();
    store.inScene('city', () => {
      const chunk = store.chunks.get('2_0')!;
      const walls = chunk.walls.map((w) => (w.id === 'main--door' ? { ...w, door: 'open' as const } : w));
      store.setChunk('2_0', { ...chunk, walls });
    });
    expect(store.docs.get('main/walls', 'door')).toMatchObject({ door: 'open', a: [300, 100] });
    expect(store.docs.all('city/walls').map((d) => d.id)).toEqual(['own']);
    await store.flush();
    const saved = JSON.parse(await readFile(join(dir, 'scenes/main/walls.json'), 'utf8')) as Chunk['walls'];
    expect(saved.find((w) => w.id === 'door')).toEqual({ id: 'door', a: [300, 100], b: [300, 200], door: 'open' });
  });

  it('follows its list of parts', async () => {
    const { store } = await city();
    const scene = store.docs.get('scenes', 'city')!;
    const told: string[] = [];
    store.on('scene', (id) => told.push(id));
    store.applyOps([
      { op: 'update', coll: 'scenes', id: 'city', rev: scene.rev, patch: { parts: [{ scene: 'cellar', x: 0, y: 0 }] } },
    ]);
    expect(store.inScene('city', () => wallIds(store))).toEqual(['cellar--cw', 'own']);
    expect(told).toEqual(['city']);
  });

  it('leaves out a part that cannot be one', async () => {
    const { store } = await city();
    const scene = store.docs.get('scenes', 'city')!;
    const parts = [
      { scene: 'city', x: 0, y: 0 },
      { scene: 'nowhere', x: 0, y: 0 },
    ];
    store.applyOps([{ op: 'update', coll: 'scenes', id: 'city', rev: scene.rev, patch: { parts } }]);
    expect(store.inScene('city', () => wallIds(store))).toEqual(['own']);
  });
});
