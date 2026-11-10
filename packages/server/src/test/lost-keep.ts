import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Player } from '@vtt/shared';
import { writeLevelDb } from './leveldb-writer.ts';

// A Foundry Data folder with one v12 world in it (LevelDB databases), and a
// map that lives outside the world, in Data/assets.

export const gm: Player = { id: 'kaniel', name: 'Kaniel', role: 'gm', color: '#e0b040' };

export async function put(path: string, content: unknown): Promise<void> {
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

export const goblin = {
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
  prototypeToken: { texture: { src: 'worlds/lost-keep/art/mira.webp?1693669309657' }, actorLink: true },
  system: { abilities, attributes: { hp: { value: 12, max: 20 } } },
  ownership: { default: 2, U1: 3 },
  items: ['I1'],
};

export const keep = {
  _id: 'S1',
  name: 'The Keep',
  active: true,
  playlist: 'P1',
  width: 1000,
  height: 800,
  padding: 0,
  grid: { size: 100, type: 1, distance: 5 },
  background: { src: 'assets/maps/keep.webp' },
  flags: { fxmaster: { effects: { r: { type: 'raintop', options: { density: 0.5 } } } } },
  walls: ['W1'],
  tokens: ['T1', 'T2', 'T3', 'T4'],
  lights: [],
  tiles: [],
  notes: [],
};

export interface LostKeep {
  /** Foundry's Data folder. */
  data: string;
  /** The world's folder in it. */
  world: string;
  /** An empty folder for games. */
  games: string;
}

/** The scenes database: the keep with its walls and tokens, and an empty cellar. */
const SCENES = {
  '!scenes!S1': keep,
  '!scenes!S2': {
    _id: 'S2',
    name: 'Cellar',
    folder: 'F6',
    width: 500,
    height: 500,
    padding: 0,
    tokens: [],
    walls: [],
  },
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
    flags: { 'levels-3d-preview': { model3d: 'worlds/lost-keep/models/boss.glb' } },
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
};

/** The world's databases (v12 LevelDB folders). */
async function writeDatabases(world: string): Promise<void> {
  const db = (name: string, docs: Record<string, unknown>) => writeLevelDb(join(world, 'data', name), docs);
  await db('scenes', SCENES);
  await db('actors', {
    '!actors!A1': goblin,
    '!actors!A2': mira,
    '!actors.items!A2.I1': { _id: 'I1', name: 'Dagger', type: 'weapon', system: { equipped: true } },
  });
  await db('folders', {
    '!folders!F1': { _id: 'F1', name: 'Monsters', type: 'Actor', folder: null, color: '#7f1d1d', sort: 200 },
    '!folders!F2': { _id: 'F2', name: 'Goblins', type: 'Actor', folder: 'F1' },
    '!folders!F3': { _id: 'F3', name: 'Lore', type: 'JournalEntry' },
    '!folders!F4': { _id: 'F4', name: 'Allies', type: 'Actor', sort: 100 },
    '!folders!F5': { _id: 'F5', name: 'Gear', type: 'Item' },
    '!folders!F6': { _id: 'F6', name: 'Dungeons', type: 'Scene' },
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
  await db('items', {
    '!items!I9': { _id: 'I9', name: 'Longsword', type: 'weapon' },
    '!items!I8': {
      _id: 'I8',
      name: 'Amulet of Dusk',
      type: 'equipment',
      ownership: { default: 2 },
      system: { attunement: 'required' },
    },
  });
  await db('settings', {
    '!settings!X1': { _id: 'X1', key: 'dnd5e.rulesVersion', value: '"legacy"' },
    '!settings!X2': { _id: 'X2', key: 'core.time', value: '90000' },
  });
  await db('users', {
    '!users!U1': { _id: 'U1', name: 'Sam', role: 1, color: '#5bcc28', password: 'hash', character: 'A2' },
    '!users!U0': { _id: 'U0', name: 'Gamemaster', role: 4 },
  });
}

/** Writes the Lost Keep world in a new Foundry Data folder. */
export async function lostKeep(): Promise<LostKeep> {
  const root = await mkdtemp(join(tmpdir(), 'foundry-data-'));
  const data = join(root, 'Data');
  const world = join(data, 'worlds', 'lost-keep');
  const games = await mkdtemp(join(tmpdir(), 'vtt-games-'));
  await put(join(world, 'world.json'), { id: 'lost-keep', title: 'The Lost Keep', system: 'dnd5e' });
  await put(join(data, 'assets/maps/keep.webp'), 'map');
  for (const art of ['goblin', 'goblin-portrait', 'mira']) await put(join(world, 'art', `${art}.webp`), art);
  await put(join(world, 'music/rain.ogg'), 'rain');
  await put(join(world, 'models/boss.glb'), 'glTF');
  await writeDatabases(world);
  return { data, world, games };
}
