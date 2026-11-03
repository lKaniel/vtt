import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFolder } from './game-folder.ts';
import { makeLegacyWorld, makeWorld } from '../test/fixtures.ts';

describe('checkFolder', () => {
  it('finds nothing wrong with a good game', async () => {
    const { issues, state } = await checkFolder(await makeWorld());
    expect(issues).toEqual([]);
    expect(state?.scenes.get('main')?.walls).toHaveLength(6);
  });

  it('leaves the explored fog the server keeps beside a scene alone', async () => {
    const dir = await makeWorld();
    await mkdir(join(dir, 'scenes/main/fog'));
    await writeFile(join(dir, 'scenes/main/fog/ana.json'), '{"cell":25,"blocks":{}}');
    expect((await checkFolder(dir)).issues).toEqual([]);
  });

  it('reports broken files, strays and scenes without settings', async () => {
    const dir = await makeWorld();
    await writeFile(join(dir, 'scenes/main/walls.json'), '[{"id":"x"}]');
    await writeFile(join(dir, 'notes.json'), '{}');
    await mkdir(join(dir, 'scenes/cellar'));
    await writeFile(join(dir, 'scenes/cellar/tokens.json'), '[]');
    const { issues } = await checkFolder(dir);
    expect(issues.map((i) => `${i.warning ? 'warning' : 'error'} ${i.file}`)).toEqual([
      'warning notes.json',
      'error scenes/main/walls.json',
      'error scenes/main/walls.json',
      'error scenes/cellar/tokens.json',
    ]);
  });

  it('reports documents in folders that are missing or of another list', async () => {
    const dir = await makeWorld();
    await mkdir(join(dir, 'folders'));
    await mkdir(join(dir, 'journals'));
    await mkdir(join(dir, 'actors'), { recursive: true });
    const write = (rel: string, data: unknown) => writeFile(join(dir, rel), JSON.stringify(data));
    await write('folders/lore.json', { id: 'lore', name: 'Lore', kind: 'journals' });
    await write('folders/inner.json', { id: 'inner', name: 'Inner', kind: 'journals', parent: 'gone' });
    await write('folders/foes.json', { id: 'foes', name: 'Foes', kind: 'actors', parent: 'lore' });
    await write('journals/sun.json', { id: 'sun', name: 'Sun', folder: 'lore' });
    await write('journals/moon.json', { id: 'moon', name: 'Moon', folder: 'foes' });
    await write('actors/wolf.json', { id: 'wolf', name: 'Wolf', folder: 'Road ambush' });
    const { issues } = await checkFolder(dir);
    expect(issues.map((i) => `${i.file}: ${i.message}`)).toEqual([
      'actors/wolf.json: folder "Road ambush" is not in folders/',
      'folders/foes.json: parent "lore" is a folder of journals, not of actors',
      'folders/inner.json: parent "gone" is not in folders/',
      'journals/moon.json: folder "foes" is a folder of actors, not of journals',
    ]);
  });

  it('points at the migration for an old world folder', async () => {
    const dir = await makeLegacyWorld();
    const { issues, state } = await checkFolder(dir);
    expect(state).toBeUndefined();
    expect(issues.filter((i) => i.message.includes('migrate-world')).map((i) => i.file)).toEqual([
      'world.json',
      'chunks',
      'tokens',
    ]);
    expect(issues).toContainEqual({ file: 'game.json', message: 'missing' });
  });
});
