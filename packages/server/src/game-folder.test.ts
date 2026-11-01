import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkFolder } from './game-folder.ts';
import { makeLegacyWorld, makeWorld } from './test/fixtures.ts';

describe('checkFolder', () => {
  it('finds nothing wrong with a good game', async () => {
    const { issues, state } = await checkFolder(await makeWorld());
    expect(issues).toEqual([]);
    expect(state?.scenes.get('main')?.walls).toHaveLength(6);
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
