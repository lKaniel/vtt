import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { importFoundryWorld } from './foundry-world.ts';
import { checkFolder } from '../store/game-folder.ts';
import { gm, goblin, keep, lostKeep, put } from '../test/lost-keep.ts';

let data: string;
let world: string;
let games: string;

beforeEach(async () => {
  ({ data, world, games } = await lostKeep());
});

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;

async function imported() {
  const dir = join(games, 'lost-keep');
  const report = await importFoundryWorld(world, dir, { gm });
  return { dir, report };
}

describe('importFoundryWorld', () => {
  it('makes a game named after the world, on its active scene, with the importer as GM', async () => {
    const { dir, report } = await imported();
    expect(await readJson(join(dir, 'game.json'))).toMatchObject({
      name: 'The Lost Keep',
      system: 'dnd5e',
      rules: '2014',
      scene: 'the-keep',
      players: [gm, { id: 'sam', name: 'Sam', role: 'player', color: '#5bcc28' }],
    });
    expect(report).toMatchObject({
      name: 'The Lost Keep',
      scenes: 2,
      actors: 3,
      tokens: 4,
      journals: 1,
      tables: 1,
      playlists: 1,
    });
  });

  it('brings every scene with its walls, music and pictures, copied from anywhere in the Data folder', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'scenes/the-keep/scene.json'))).toMatchObject({
      name: 'The Keep',
      playlist: 'rain',
      weather: [{ kind: 'rain', density: 0.5 }],
    });
    expect(await readJson(join(dir, 'scenes/the-keep/tiles.json'))).toMatchObject([
      { id: 'background', src: '/assets/foundry/assets/maps/keep.webp' },
    ]);
    expect(await readJson(join(dir, 'scenes/the-keep/walls.json'))).toMatchObject([{ a: [100, 100], b: [500, 100] }]);
    expect(await readFile(join(dir, 'assets/foundry/assets/maps/keep.webp'), 'utf8')).toBe('map');
    expect((await stat(join(dir, 'scenes/cellar/scene.json'))).isFile()).toBe(true);
  });

  it('places tokens on their actors: linked characters, unlinked copies with their own wounds', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'scenes/the-keep/tokens.json'))).toEqual([
      { id: 'goblin', x: 250, y: 350, actor: 'goblin', linked: false },
      {
        id: 'goblin-boss',
        x: 500,
        y: 400,
        actor: 'goblin',
        linked: false,
        hidden: true,
        delta: {
          name: 'Goblin Boss',
          size: 2,
          model: { src: '/assets/foundry/worlds/lost-keep/models/boss.glb' },
          hp: 3,
        },
      },
      { id: 'mira', x: 650, y: 650, actor: 'mira', linked: true },
      { id: 'statue', x: 50, y: 50, actor: 'statue', linked: false },
    ]);
    expect(await readJson(join(dir, 'actors/statue.json'))).toMatchObject({
      name: 'Statue',
      img: '/assets/foundry/worlds/lost-keep/art/goblin.webp',
    });
  });

  it('turns actors into sheets, in their folders, with their token art', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'actors/goblin.json'))).toEqual({
      id: 'goblin',
      name: 'Goblin',
      img: '/assets/foundry/worlds/lost-keep/art/goblin.webp',
      folder: 'goblins',
      linked: false,
      monster: 'goblin',
    });
    expect(await readJson(join(dir, 'folders/monsters.json'))).toMatchObject({
      id: 'monsters',
      name: 'Monsters',
      kind: 'actors',
      color: '#7f1d1d',
    });
    expect(await readJson(join(dir, 'folders/goblins.json'))).toMatchObject({ kind: 'actors', parent: 'monsters' });
    // Foundry's order among siblings is kept, and folders of lists we don't have stay behind.
    const sortOf = async (id: string) => ((await readJson(join(dir, `folders/${id}.json`))) as { sort: string }).sort;
    expect((await sortOf('allies')) < (await sortOf('monsters'))).toBe(true);
    expect(await readdir(join(dir, 'folders'))).not.toContain('gear.json');
    expect(await readJson(join(dir, 'scenes/cellar/scene.json'))).toMatchObject({ folder: 'dungeons' });
    expect(await readJson(join(dir, 'actors/mira.json'))).toMatchObject({
      id: 'mira',
      img: '/assets/foundry/worlds/lost-keep/art/mira.webp',
      ownership: { default: 'observer' },
      linked: true,
      hp: 12,
      inventory: [{ item: 'dagger', equipped: true }],
    });
  });

  it('brings journal entries, tables and playlists in their folders', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'journals/history.json'))).toMatchObject({
      folder: 'lore',
      pages: [{ text: '<p>Old.</p>' }],
    });
    expect(await readJson(join(dir, 'tables/loot.json'))).toMatchObject({ results: [{ text: 'A coin' }] });
    expect(await readJson(join(dir, 'playlists/rain.json'))).toMatchObject({
      tracks: [{ src: '/assets/foundry/worlds/lost-keep/music/rain.ogg' }],
    });
  });

  it('brings chat macros and says the item-roll macros are the hotbar’s', async () => {
    const { dir, report } = await imported();
    expect(await readJson(join(dir, 'macros/hail.json'))).toMatchObject({ name: 'Hail', command: 'Well met!' });
    expect(report.macros).toBe(1);
    expect(report.left).toContainEqual(
      expect.objectContaining({
        what: 'Macros that roll an item from the hotbar (our hotbar does that already)',
        count: 1,
      }),
    );
  });

  it("gives Foundry's users the actors and entries Foundry let them own or see", async () => {
    const { dir } = await imported();
    const actors = await readdir(join(dir, 'actors'));
    const files = await Promise.all(actors.map((f) => readJson(join(dir, 'actors', f))));
    expect(files).toContainEqual(
      expect.objectContaining({ name: 'Mira', ownership: { default: 'observer', sam: 'owner' } }),
    );
  });

  it("names each player's character as Foundry's user did", async () => {
    const { dir } = await imported();
    const game = (await readJson(join(dir, 'game.json'))) as { players: { id: string; character?: string }[] };
    const mira = (await readdir(join(dir, 'actors'))).find((f) => f.startsWith('mira'))!.replace('.json', '');
    expect(game.players.find((p) => p.id === 'sam')?.character).toBe(mira);
  });

  it('keeps the world’s time on the game clock', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'time.json'))).toMatchObject({ time: 90000, calendar: { sunrise: 6 } });
  });

  it('makes a game that passes check-game', async () => {
    const { dir } = await imported();
    const { issues } = await checkFolder(dir);
    expect(issues.filter((i) => !i.warning)).toEqual([]);
  });

  it("makes the world's own items homebrew, seen by whom Foundry showed them", async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'homebrew/amulet-of-dusk.json'))).toMatchObject({
      id: 'amulet-of-dusk',
      kind: 'item',
      name: 'Amulet of Dusk',
      item: { type: 'gear', attunement: true },
      ownership: { default: 'observer' },
    });
  });

  it('says what stayed behind', async () => {
    const { report } = await imported();
    expect(report.left).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          what: 'Items in the Items sidebar the Compendium already has, or that only live on sheets',
          examples: ['Longsword'],
        }),
        expect.objectContaining({ examples: ['Sam'], count: 1 }),
      ]),
    );
  });

  it('reads a Foundry v10 world, whose databases are .db files', async () => {
    const old = join(data, 'worlds', 'old-keep');
    await put(join(old, 'world.json'), { name: 'old-keep', title: 'Old Keep', system: 'dnd5e' });
    await put(
      join(old, 'data/scenes.db'),
      JSON.stringify({ ...keep, walls: [], tokens: [{ name: 'Goblin', actorId: 'A1', x: 0, y: 0 }] }),
    );
    await put(join(old, 'data/actors.db'), JSON.stringify(goblin));
    const report = await importFoundryWorld(old, join(games, 'old-keep'), { gm });
    expect(report).toMatchObject({ scenes: 1, actors: 1, tokens: 1 });
  });

  it('refuses a folder without world.json', async () => {
    await expect(importFoundryWorld(data, join(games, 'x'), { gm })).rejects.toThrow(/world\.json/);
  });
});
