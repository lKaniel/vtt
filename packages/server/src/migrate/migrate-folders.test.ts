import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateActorsFolder } from './migrate-actors.ts';
import { migrateFoldersFolder } from './migrate-folders.ts';
import { migrateOwnershipFolder } from './migrate-ownership.ts';
import { makeWorld } from '../test/fixtures.ts';

const read = async (dir: string, rel: string) => JSON.parse(await readFile(join(dir, rel), 'utf8')) as unknown;
const write = (dir: string, rel: string, data: unknown) => writeFile(join(dir, rel), JSON.stringify(data));

async function format4(): Promise<string> {
  const dir = await makeWorld();
  await migrateActorsFolder(dir);
  await migrateOwnershipFolder(dir);
  return dir;
}

describe('migrateFoldersFolder', () => {
  it('turns folder names into folder documents of each list, nested by " / ", once', async () => {
    const dir = await format4();
    await mkdir(join(dir, 'journals'));
    await write(dir, 'actors/wolf.json', { id: 'wolf', name: 'Wolf', folder: 'Road ambush' });
    await write(dir, 'actors/bandit.json', { id: 'bandit', name: 'Bandit', folder: 'Road ambush / Camp' });
    await write(dir, 'journals/road.json', { id: 'road', name: 'Road', folder: 'Road ambush' });
    await write(dir, 'scenes/main/scene.json', { darkness: 1, folder: 'Towns' });

    const done = await migrateFoldersFolder(dir, { now: new Date('2026-11-03T00:00:00Z') });

    expect(done).toEqual({ backup: '.v4-backup/2026-11-03T00-00-00Z', folders: 4 });
    expect(await read(dir, 'folders/road-ambush.json')).toMatchObject({
      id: 'road-ambush',
      name: 'Road ambush',
      kind: 'actors',
    });
    expect(await read(dir, 'folders/camp.json')).toMatchObject({ name: 'Camp', kind: 'actors', parent: 'road-ambush' });
    expect(await read(dir, 'folders/road-ambush-2.json')).toMatchObject({ name: 'Road ambush', kind: 'journals' });
    expect(await read(dir, 'folders/towns.json')).toMatchObject({ name: 'Towns', kind: 'scenes' });
    expect(await read(dir, 'actors/wolf.json')).toMatchObject({ folder: 'road-ambush' });
    expect(await read(dir, 'actors/bandit.json')).toMatchObject({ folder: 'camp' });
    expect(await read(dir, 'journals/road.json')).toMatchObject({ folder: 'road-ambush-2' });
    expect(await read(dir, 'scenes/main/scene.json')).toMatchObject({ folder: 'towns' });
    expect(await read(dir, 'game.json')).toMatchObject({ format: 5 });
    expect(await read(dir, '.v4-backup/2026-11-03T00-00-00Z/journals/road.json')).toMatchObject({
      folder: 'Road ambush',
    });
    expect(await migrateFoldersFolder(dir)).toBeNull();
  });

  it('only moves the format up when nothing is in a folder', async () => {
    const dir = await format4();
    expect(await migrateFoldersFolder(dir)).toEqual({ folders: 0 });
    expect(await read(dir, 'game.json')).toMatchObject({ format: 5 });
  });
});
