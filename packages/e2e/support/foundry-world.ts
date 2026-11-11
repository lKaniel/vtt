// A tiny Foundry VTT world on disk (v11+ LevelDB databases), for the
// importer. It uses the server tests' LevelDB writer.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeLevelDb } from '../../server/src/test/leveldb-writer.ts';
import { put } from '../../server/src/test/lost-keep.ts';

const goblin = {
  _id: 'A1',
  name: 'Goblin',
  type: 'npc',
  prototypeToken: { width: 1, actorLink: false },
  system: { attributes: { hp: { value: 7, max: 7 } } },
  ownership: { default: 0 },
  items: [],
};

const keep = {
  _id: 'S1',
  name: 'The Keep',
  active: true,
  width: 1000,
  height: 800,
  padding: 0,
  grid: { size: 100, type: 1, distance: 5 },
  walls: ['W1'],
  tokens: ['T1'],
  lights: [],
  tiles: [],
  notes: [],
};

/** Makes the world `<Data>/worlds/lost-keep` in a fresh folder; returns the world's folder. */
export async function makeFoundryWorld(): Promise<string> {
  const data = join(await mkdtemp(join(tmpdir(), 'foundry-data-')), 'Data');
  const world = join(data, 'worlds', 'lost-keep');
  await put(join(world, 'world.json'), { id: 'lost-keep', title: 'The Lost Keep', system: 'dnd5e' });
  const db = (name: string, docs: Record<string, unknown>) => writeLevelDb(join(world, 'data', name), docs);
  await db('scenes', {
    '!scenes!S1': keep,
    '!scenes.walls!S1.W1': { _id: 'W1', c: [100, 100, 500, 100] },
    '!scenes.tokens!S1.T1': { _id: 'T1', name: 'Goblin', actorId: 'A1', x: 200, y: 300, width: 1, height: 1 },
  });
  await db('actors', { '!actors!A1': goblin });
  await db('journal', {
    '!journal!J1': { _id: 'J1', name: 'History', pages: ['G1'] },
    '!journal.pages!J1.G1': { _id: 'G1', name: 'Founding', type: 'text', text: { content: '<p>Old.</p>' } },
  });
  return world;
}
