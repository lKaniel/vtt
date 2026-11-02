import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Backups } from './backups.ts';
import { makeWorld } from '../test/fixtures.ts';

const setup = async (keep?: number) => {
  const game = await makeWorld();
  await mkdir(join(game, 'assets'), { recursive: true });
  await writeFile(join(game, 'assets/map.webp'), 'picture');
  const backups = new Backups(await mkdtemp(join(tmpdir(), 'vtt-data-')), keep);
  return { game, backups };
};

describe('backups', () => {
  it('copy the game folder without its pictures, and skip a copy when nothing changed', async () => {
    const { game, backups } = await setup();
    const first = await backups.snapshot('test', game, 'load');
    expect(first).toMatchObject({ reason: 'load' });
    expect(await backups.snapshot('test', game, 'timer')).toBeUndefined();
    await writeFile(join(game, 'game.json'), '{"changed":true}');
    const second = await backups.snapshot('test', game, 'timer');
    expect(second).toMatchObject({ reason: 'timer' });
    expect((await backups.list('test')).map((b) => b.id)).toEqual([second!.id, first!.id]);
    expect(await readdir(backups.dirOf('test', first!.id))).not.toContain('assets');
  });

  it('a manual backup is made even when nothing changed', async () => {
    const { game, backups } = await setup();
    await backups.snapshot('test', game, 'load');
    expect(await backups.snapshot('test', game, 'manual')).toBeDefined();
  });

  it('keep only the newest few', async () => {
    const { game, backups } = await setup(2);
    for (let i = 0; i < 4; i++) {
      await writeFile(join(game, 'game.json'), JSON.stringify({ i }));
      await backups.snapshot('test', game, 'timer');
    }
    expect(await backups.list('test')).toHaveLength(2);
  });

  it('restore puts the copy back over the folder, keeping its pictures', async () => {
    const { game, backups } = await setup();
    const before = await readFile(join(game, 'game.json'), 'utf8');
    const copy = (await backups.snapshot('test', game, 'manual'))!;
    await writeFile(join(game, 'game.json'), '{"changed":true}');
    await writeFile(join(game, 'stray.json'), '[]');
    await backups.restore('test', copy.id, game);
    expect(await readFile(join(game, 'game.json'), 'utf8')).toBe(before);
    expect(await readdir(game)).not.toContain('stray.json');
    expect(await readFile(join(game, 'assets/map.webp'), 'utf8')).toBe('picture');
  });

  it('refuse a backup that is not there', async () => {
    const { game, backups } = await setup();
    await expect(backups.restore('test', '../../etc', game)).rejects.toThrow(/backup/);
  });
});
