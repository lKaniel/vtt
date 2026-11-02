import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Player } from '@vtt/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { importFoundryWorld } from './foundry-world.ts';
import { checkFolder } from './game-folder.ts';
import { writeLevelDb } from './test/leveldb-writer.ts';

// A Foundry Data folder with one v12 world in it (LevelDB databases), and a
// map that lives outside the world, in Data/assets.

let data: string;
let world: string;
let games: string;
const gm: Player = { id: 'kaniel', name: 'Kaniel', role: 'gm', color: '#e0b040' };

async function put(path: string, content: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
}

const abilities = {
  str: { value: 10 },
  dex: { value: 14 },
  con: { value: 12 },
  int: { value: 16 },
  wis: { value: 10 },
  cha: { value: 8 },
};

const goblin = {
  _id: 'A1',
  name: 'Goblin',
  type: 'npc',
  img: 'worlds/lost-keep/art/goblin-portrait.webp',
  folder: 'F2',
  prototypeToken: { texture: { src: 'worlds/lost-keep/art/goblin.webp' }, width: 1, actorLink: false },
  system: { attributes: { hp: { value: 7, max: 7 } } },
  ownership: { default: 0 },
  items: [],
};

const mira = {
  _id: 'A2',
  name: 'Mira',
  type: 'character',
  img: 'icons/svg/mystery-man.svg',
  prototypeToken: { texture: { src: 'worlds/lost-keep/art/mira.webp' }, actorLink: true },
  system: { abilities, attributes: { hp: { value: 12, max: 20 } } },
  ownership: { default: 2, U1: 3 },
  items: ['I1'],
};

const keep = {
  _id: 'S1',
  name: 'The Keep',
  active: true,
  playlist: 'P1',
  width: 1000,
  height: 800,
  padding: 0,
  grid: { size: 100, type: 1, distance: 5 },
  background: { src: 'assets/maps/keep.webp' },
  walls: ['W1'],
  tokens: ['T1', 'T2', 'T3', 'T4'],
  lights: [],
  tiles: [],
  notes: [],
};

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'foundry-data-'));
  data = join(root, 'Data');
  world = join(data, 'worlds', 'lost-keep');
  games = await mkdtemp(join(tmpdir(), 'vtt-games-'));
  await put(join(world, 'world.json'), { id: 'lost-keep', title: 'The Lost Keep', system: 'dnd5e' });
  await put(join(data, 'assets/maps/keep.webp'), 'map');
  for (const art of ['goblin', 'goblin-portrait', 'mira']) await put(join(world, 'art', `${art}.webp`), art);
  await put(join(world, 'music/rain.ogg'), 'rain');
  const db = (name: string, docs: Record<string, unknown>) => writeLevelDb(join(world, 'data', name), docs);
  await db('scenes', {
    '!scenes!S1': keep,
    '!scenes!S2': { _id: 'S2', name: 'Cellar', width: 500, height: 500, padding: 0, tokens: [], walls: [] },
    '!scenes.walls!S1.W1': { _id: 'W1', c: [100, 100, 500, 100] },
    '!scenes.tokens!S1.T1': { _id: 'T1', name: 'Goblin', actorId: 'A1', x: 200, y: 300, width: 1, height: 1 },
    '!scenes.tokens!S1.T2': {
      _id: 'T2',
      name: 'Goblin Boss',
      actorId: 'A1',
      x: 400,
      y: 300,
      width: 2,
      hidden: true,
      delta: { system: { attributes: { hp: { value: 3 } } } },
    },
    '!scenes.tokens!S1.T3': { _id: 'T3', name: 'Mira', actorId: 'A2', actorLink: true, x: 600, y: 600, width: 1 },
    '!scenes.tokens!S1.T4': {
      _id: 'T4',
      name: 'Statue',
      actorId: 'GONE',
      x: 0,
      y: 0,
      width: 1,
      texture: { src: 'worlds/lost-keep/art/goblin.webp' },
    },
  });
  await db('actors', {
    '!actors!A1': goblin,
    '!actors!A2': mira,
    '!actors.items!A2.I1': { _id: 'I1', name: 'Dagger', type: 'weapon', system: { equipped: true } },
  });
  await db('folders', {
    '!folders!F1': { _id: 'F1', name: 'Monsters', type: 'Actor', folder: null },
    '!folders!F2': { _id: 'F2', name: 'Goblins', type: 'Actor', folder: 'F1' },
    '!folders!F3': { _id: 'F3', name: 'Lore', type: 'JournalEntry' },
  });
  await db('journal', {
    '!journal!J1': { _id: 'J1', name: 'History', folder: 'F3', pages: ['G1'] },
    '!journal.pages!J1.G1': { _id: 'G1', name: 'Founding', type: 'text', text: { content: '<p>Old.</p>' } },
  });
  await db('tables', {
    '!tables!R1': { _id: 'R1', name: 'Loot', results: ['X1'] },
    '!tables.results!R1.X1': { _id: 'X1', text: 'A coin', range: [1, 1] },
  });
  await db('playlists', {
    '!playlists!P1': { _id: 'P1', name: 'Rain', sounds: ['N1'] },
    '!playlists.sounds!P1.N1': { _id: 'N1', name: 'Rain', path: 'worlds/lost-keep/music/rain.ogg' },
  });
  await db('macros', {
    '!macros!M1': { _id: 'M1', name: 'Hail', type: 'chat', command: 'Well met!' },
    '!macros!M2': { _id: 'M2', name: 'Sword', type: 'script', command: 'dnd5e.documents.macro.rollItem("Sword")' },
  });
  await db('items', { '!items!I9': { _id: 'I9', name: 'Longsword', type: 'weapon' } });
  await db('settings', { '!settings!X1': { _id: 'X1', key: 'dnd5e.rulesVersion', value: '"legacy"' } });
  await db('users', {
    '!users!U1': { _id: 'U1', name: 'Sam' },
    '!users!U0': { _id: 'U0', name: 'Gamemaster', role: 4 },
  });
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
      players: [gm],
    });
    expect(report).toMatchObject({
      name: 'The Lost Keep',
      scenes: 2,
      actors: 2,
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
        delta: { name: 'Goblin Boss', size: 2, hp: 3 },
      },
      { id: 'mira', x: 650, y: 650, actor: 'mira', linked: true },
      { id: 'statue', name: 'Statue', x: 50, y: 50, img: '/assets/foundry/worlds/lost-keep/art/goblin.webp' },
    ]);
  });

  it('turns actors into sheets, in their folders, with their token art', async () => {
    const { dir } = await imported();
    expect(await readJson(join(dir, 'actors/goblin.json'))).toEqual({
      id: 'goblin',
      name: 'Goblin',
      img: '/assets/foundry/worlds/lost-keep/art/goblin.webp',
      folder: 'Monsters / Goblins',
      linked: false,
      monster: 'goblin',
    });
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
      folder: 'Lore',
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
    expect(report.skipped).toContain('1 macro that rolls an item from the hotbar: our hotbar does that already');
  });

  it('makes a game that passes check-game', async () => {
    const { dir } = await imported();
    const { issues } = await checkFolder(dir);
    expect(issues.filter((i) => !i.warning)).toEqual([]);
  });

  it('says what stayed behind', async () => {
    const { report } = await imported();
    expect(report.skipped).toEqual(
      expect.arrayContaining([
        'scene "The Keep": token "Statue" stands for an actor that is not in the world, so it carries only its name and picture',
        '1 item in the Items sidebar (Longsword): drag items from the Compendium instead',
        "Foundry users (Sam): invite your players with the game's invite link; their characters are actors to give them",
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
