import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateFolder, migrateWorld } from './migrate-world.ts';
import { makeLegacyWorld } from './test/fixtures.ts';

const world = {
  name: 'The crossroads',
  gridSize: 100,
  chunkSize: 2000,
  start: [1000, 900],
  darkness: 0.85,
  rules: '2014',
  players: [{ id: 'gm', name: 'GM', role: 'gm' }],
};
const grass = (x: number) => ({ kind: 'rect', id: 'grass', x, y: 0, w: 2000, h: 2000, color: '#6f8f4e' });

describe('migrateWorld', () => {
  it('splits world.json into game.json and the settings of one scene', () => {
    const { files } = migrateWorld({ world, chunks: {}, tokens: [] }, { gameId: 'example', sceneId: 'crossroads' });
    expect(files.get('game.json')).toEqual({
      id: 'example',
      name: 'The crossroads',
      rules: '2014',
      scene: 'crossroads',
      players: world.players,
    });
    expect(files.get('scenes/crossroads/scene.json')).toEqual({
      name: 'The crossroads',
      gridSize: 100,
      chunkSize: 2000,
      start: [1000, 900],
      darkness: 0.85,
    });
  });

  it('names the game after the world and the scene "main" when not told otherwise', () => {
    const { files } = migrateWorld({ world, chunks: {}, tokens: [] });
    expect(files.get('game.json')).toMatchObject({ id: 'the-crossroads', scene: 'main' });
    expect(files.get('scenes/main/tokens.json')).toEqual([]);
  });

  it('gathers the chunks into one file per collection, renaming ids two chunks shared', () => {
    const wall = { id: 'wall-1', a: [0, 0], b: [100, 0] };
    const { files, notes } = migrateWorld(
      {
        world,
        chunks: {
          '1_0': { tiles: [grass(2000)], walls: [{ ...wall, a: [2000, 0], b: [2100, 0] }] },
          '0_0': { tiles: [grass(0)], walls: [wall], lights: [{ id: 'lamp', x: 5, y: 5, bright: 10 }] },
        },
        tokens: [{ id: 'bram', name: 'Bram', x: 50, y: 50 }],
      },
      { sceneId: 's' },
    );
    expect((files.get('scenes/s/tiles.json') as { id: string; x: number }[]).map((t) => [t.id, t.x])).toEqual([
      ['grass', 0],
      ['grass-2', 2000],
    ]);
    expect((files.get('scenes/s/walls.json') as { id: string }[]).map((w) => w.id)).toEqual(['wall-1', 'wall-2']);
    expect(files.get('scenes/s/lights.json')).toEqual([{ id: 'lamp', x: 5, y: 5, bright: 10 }]);
    expect(files.get('scenes/s/tokens.json')).toEqual([{ id: 'bram', name: 'Bram', x: 50, y: 50 }]);
    expect(notes).toEqual([
      'chunks/1_0.json: tile "grass" is now "grass-2" (ids are unique per scene)',
      'chunks/1_0.json: wall "wall-1" is now "wall-2" (ids are unique per scene)',
    ]);
  });

  it('adds files left over from the old layout to a game that is already migrated', () => {
    const existing = new Map<string, unknown>([
      ['game.json', { id: 'g', name: 'G', scene: 'main', players: world.players }],
      ['scenes/main/tokens.json', [{ id: 'bram', name: 'Bram', x: 50, y: 50 }]],
      ['scenes/main/walls.json', []],
    ]);
    const { files, notes } = migrateWorld(
      {
        chunks: { '0_0': { walls: [{ id: 'w', a: [0, 0], b: [1, 0] }] } },
        tokens: [
          { id: 'bram', name: 'Bram', x: 950, y: 50 },
          { id: 'orrin', name: 'Orrin', x: 150, y: 50 },
        ],
      },
      { existing },
    );
    expect(files.has('game.json')).toBe(false);
    expect((files.get('scenes/main/tokens.json') as { id: string }[]).map((t) => t.id)).toEqual([
      'bram',
      'bram-2',
      'orrin',
    ]);
    expect(files.get('scenes/main/walls.json')).toEqual([{ id: 'w', a: [0, 0], b: [1, 0] }]);
    expect(notes).toContain('tokens/bram.json: token "bram" is now "bram-2" (ids are unique per scene)');
  });

  it('refuses a world it cannot read rather than lose part of it', () => {
    expect(() => migrateWorld({ chunks: {}, tokens: [] })).toThrow(/world.json/);
    expect(() => migrateWorld({ world, chunks: { '0_0': { walls: 'oops' } }, tokens: [] })).toThrow(/chunks\/0_0.json/);
    expect(() => migrateWorld({ world, chunks: {}, tokens: [{ name: 'no id' }] })).toThrow(/token/);
  });
});

describe('migrateFolder', () => {
  it('converts an old world folder in place and keeps the old files in a backup', async () => {
    const dir = await makeLegacyWorld();
    const result = await migrateFolder(dir, { now: new Date('2026-11-01T10:00:00Z') });
    expect(result?.backup).toBe('.v1-backup/2026-11-01T10-00-00Z');
    expect((await readdir(dir)).sort((a, b) => a.localeCompare(b))).toEqual([
      '.v1-backup',
      'actors',
      'combat.json',
      'game.json',
      'scenes',
    ]);
    const backup = join(dir, result!.backup);
    expect((await readdir(backup)).sort((a, b) => a.localeCompare(b))).toEqual([
      'actors',
      'chunks',
      'combat.json',
      'tokens',
      'world.json',
    ]);
    const game = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as { name: string; scene: string };
    expect(game).toMatchObject({ name: 'Test', scene: 'main' });
    const tokens = JSON.parse(await readFile(join(dir, 'scenes/main/tokens.json'), 'utf8')) as { id: string }[];
    expect(tokens.map((t) => t.id).sort((a, b) => a.localeCompare(b))).toEqual(['goblin', 'hero']);
    expect(await readdir(join(dir, 'actors'))).toEqual(['bandit.json']);
  });

  it('does nothing to a folder that is already migrated', async () => {
    const dir = await makeLegacyWorld();
    await migrateFolder(dir);
    expect(await migrateFolder(dir)).toBeNull();
  });

  it('stops before touching anything when an old file is broken', async () => {
    const dir = await makeLegacyWorld();
    await writeFile(join(dir, 'tokens/goblin.json'), '{ broken');
    await expect(migrateFolder(dir)).rejects.toThrow(/tokens\/goblin.json/);
    expect((await readdir(dir)).sort((a, b) => a.localeCompare(b))).toEqual([
      'actors',
      'chunks',
      'combat.json',
      'tokens',
      'world.json',
    ]);
  });

  it('merges a token added to the old tokens/ folder after the move', async () => {
    const dir = await makeLegacyWorld();
    await migrateFolder(dir);
    await mkdir(join(dir, 'tokens'));
    await writeFile(join(dir, 'tokens/wolf.json'), JSON.stringify({ id: 'wolf', name: 'Wolf', x: 50, y: 50 }));
    const again = await migrateFolder(dir, { now: new Date('2026-11-02T00:00:00Z') });
    expect(again?.backup).toBe('.v1-backup/2026-11-02T00-00-00Z');
    expect((await readdir(join(dir, again!.backup))).sort((a, b) => a.localeCompare(b))).toEqual([
      'actors',
      'combat.json',
      'game.json',
      'scenes',
      'tokens',
    ]);
    const tokens = JSON.parse(await readFile(join(dir, 'scenes/main/tokens.json'), 'utf8')) as { id: string }[];
    expect(tokens.map((t) => t.id)).toContain('wolf');
    expect(await readdir(dir)).not.toContain('tokens');
  });
});
