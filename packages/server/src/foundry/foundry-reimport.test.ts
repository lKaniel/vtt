import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { importFoundryWorld } from './foundry-world.ts';
import { IMPORT_MANIFEST, readManifest, reimportFoundryWorld } from './foundry-reimport.ts';
import { checkFolder } from '../store/game-folder.ts';
import { gm, lostKeep } from '../test/lost-keep.ts';

// Importing a Foundry world again into the game it made: Foundry's scenes,
// actors and entries are brought in fresh, and what was made in the VTT
// since (scenes, actors, pictures, players' seats, explored fog) stays.

let world: string;
let dir: string;

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;

async function put(path: string, content: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
}

/** A scene Claude built in the game, on an actor of its own, in a folder of its own. */
async function addVttScene(id = 'claude-grotto', name = 'Sunken Grotto'): Promise<void> {
  await put(join(dir, `scenes/${id}/scene.json`), { name, folder: 'claude-maps', gridSize: 100 });
  await put(join(dir, `scenes/${id}/tiles.json`), [
    { id: 'ground', kind: 'image', x: 0, y: 0, w: 500, h: 500, src: '/assets/claude-maps/grotto.png' },
  ]);
  await put(join(dir, `scenes/${id}/tokens.json`), [{ id: 'eel', x: 50, y: 50, actor: 'giant-eel', linked: false }]);
  await put(join(dir, 'actors/giant-eel.json'), { id: 'giant-eel', name: 'Giant Eel', monster: 'reef-shark' });
  await put(join(dir, 'folders/claude-maps.json'), { id: 'claude-maps', name: 'Claude maps', kind: 'scenes' });
  await put(join(dir, 'assets/claude-maps/grotto.png'), 'png');
}

beforeEach(async () => {
  const keep = await lostKeep();
  world = keep.world;
  dir = join(keep.games, 'lost-keep');
  await importFoundryWorld(world, dir, { gm });
});

describe('importFoundryWorld', () => {
  it('lists what it made and where from, for a later re-import', async () => {
    const manifest = await readManifest(dir);
    expect(manifest?.world).toBe(world);
    expect(manifest?.files).toEqual(expect.arrayContaining(['scenes/the-keep/scene.json', 'actors/goblin.json']));
    expect(manifest?.files).not.toContain(IMPORT_MANIFEST);
  });
});

describe('reimportFoundryWorld', () => {
  it('keeps scenes made in the VTT, with their pictures, folders and actors', async () => {
    await addVttScene();
    const report = await reimportFoundryWorld(world, dir, { gm });
    expect(report.kept?.scenes).toEqual(['Sunken Grotto']);
    expect(await readJson(join(dir, 'scenes/claude-grotto/scene.json'))).toMatchObject({ name: 'Sunken Grotto' });
    expect(await readdir(join(dir, 'scenes/claude-grotto'))).toEqual(
      expect.arrayContaining(['tiles.json', 'tokens.json']),
    );
    expect(await readJson(join(dir, 'actors/giant-eel.json'))).toMatchObject({ name: 'Giant Eel' });
    expect(await readJson(join(dir, 'folders/claude-maps.json'))).toMatchObject({ kind: 'scenes' });
    expect(await readFile(join(dir, 'assets/claude-maps/grotto.png'), 'utf8')).toBe('png');
    const { issues } = await checkFolder(dir);
    expect(issues.filter((i) => !i.warning)).toEqual([]);
  });

  it("brings Foundry's scenes in fresh, but keeps what the players explored", async () => {
    await put(join(dir, 'scenes/the-keep/walls.json'), []);
    await put(join(dir, 'scenes/the-keep/fog/sam.png'), 'fog');
    await reimportFoundryWorld(world, dir, { gm });
    expect(await readJson(join(dir, 'scenes/the-keep/walls.json'))).toMatchObject([{ a: [100, 100] }]);
    expect(await readFile(join(dir, 'scenes/the-keep/fog/sam.png'), 'utf8')).toBe('fog');
  });

  it("keeps the game's players, name and packs, and the scene everyone is on", async () => {
    await addVttScene();
    const game = await readJson(join(dir, 'game.json'));
    const players = [...(game.players as object[]), { id: 'maks', name: 'Maks', role: 'player', color: '#123456' }];
    await put(join(dir, 'game.json'), {
      ...game,
      name: 'Cursed Lands',
      packs: ['jb2a'],
      scene: 'claude-grotto',
      players,
    });
    await reimportFoundryWorld(world, dir, { gm });
    expect(await readJson(join(dir, 'game.json'))).toMatchObject({
      id: 'lost-keep',
      name: 'Cursed Lands',
      packs: ['jb2a'],
      scene: 'claude-grotto',
      players,
    });
  });

  it('drops what the last import made that Foundry no longer has', async () => {
    const manifest = (await readManifest(dir))!;
    await put(join(dir, 'journals/burnt-letter.json'), { id: 'burnt-letter', name: 'Burnt letter', pages: [] });
    await put(join(dir, IMPORT_MANIFEST), { ...manifest, files: [...manifest.files, 'journals/burnt-letter.json'] });
    await reimportFoundryWorld(world, dir, { gm });
    expect(await readdir(join(dir, 'journals'))).not.toContain('burnt-letter.json');
  });

  it('moves a VTT scene out of the way of a Foundry scene with the same id', async () => {
    // Foundry's Cellar was deleted, the GM built a cellar of their own, then Foundry got a Cellar again.
    const manifest = (await readManifest(dir))!;
    await rm(join(dir, 'scenes/cellar'), { recursive: true });
    await addVttScene('cellar', 'Wine cellar');
    const files = manifest.files.filter((f) => !f.startsWith('scenes/cellar/'));
    await put(join(dir, IMPORT_MANIFEST), { ...manifest, files });
    const report = await reimportFoundryWorld(world, dir, { gm });
    expect(await readJson(join(dir, 'scenes/cellar/scene.json'))).toMatchObject({ name: 'Cellar' });
    expect(await readJson(join(dir, 'scenes/cellar-2/scene.json'))).toMatchObject({ name: 'Wine cellar' });
    expect(report.kept?.scenes).toEqual(['Wine cellar']);
  });

  it('treats a game imported before re-imports existed as all Foundry, keeping only what is new', async () => {
    await addVttScene();
    await rm(join(dir, IMPORT_MANIFEST));
    const report = await reimportFoundryWorld(world, dir, { gm });
    expect(report.kept?.scenes).toEqual(['Sunken Grotto']);
    expect(report.scenes).toBe(2);
  });

  it('leaves the game as it was when the world cannot be read', async () => {
    await addVttScene();
    await expect(reimportFoundryWorld(join(world, 'nope'), dir, { gm })).rejects.toThrow();
    expect(await readJson(join(dir, 'scenes/claude-grotto/scene.json'))).toMatchObject({ name: 'Sunken Grotto' });
    expect(await readdir(dirname(dir))).toEqual(['lost-keep']);
  });
});
