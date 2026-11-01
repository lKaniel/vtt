import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrateActorsFolder } from './migrate-actors.ts';
import { migrateOwnershipFolder, ownedSheet } from './migrate-ownership.ts';
import { makeWorld } from './test/fixtures.ts';

const read = async (dir: string, rel: string) => JSON.parse(await readFile(join(dir, rel), 'utf8')) as unknown;

describe('ownedSheet', () => {
  it('turns controllers and observers into ownership levels', () => {
    expect(ownedSheet({ id: 'x', controllers: ['ana'], observers: ['bo'] })).toEqual({
      id: 'x',
      ownership: { default: 'limited', bo: 'observer', ana: 'owner' },
    });
  });

  it('drops empty lists, and leaves sheets without them alone', () => {
    expect(ownedSheet({ id: 'x', controllers: [] })).toEqual({ id: 'x' });
    const plain = { id: 'y', name: 'Y' };
    expect(ownedSheet(plain)).toBe(plain);
  });
});

describe('migrateOwnershipFolder', () => {
  it('moves actors and tokens (and their deltas) to ownership levels, once', async () => {
    const dir = await makeWorld();
    await migrateActorsFolder(dir);
    const tokens = (await read(dir, 'scenes/main/tokens.json')) as object[];
    const delta = { id: 'scout', x: 50, y: 50, actor: 'hero', linked: false, delta: { observers: ['bo'] } };
    await writeFile(join(dir, 'scenes/main/tokens.json'), JSON.stringify([...tokens, delta]));

    const done = await migrateOwnershipFolder(dir, { now: new Date('2026-11-01T00:00:00Z') });

    expect(done).toEqual({ backup: '.v3-backup/2026-11-01T00-00-00Z' });
    expect(await read(dir, 'actors/hero.json')).toMatchObject({ ownership: { default: 'limited', ana: 'owner' } });
    expect(await read(dir, 'actors/hero.json')).not.toHaveProperty('controllers');
    expect(((await read(dir, 'scenes/main/tokens.json')) as object[]).at(-1)).toEqual({
      ...delta,
      delta: { ownership: { default: 'limited', bo: 'observer', ana: 'owner' } },
    });
    expect(await read(dir, 'game.json')).toMatchObject({ format: 4 });
    expect(await read(dir, '.v3-backup/2026-11-01T00-00-00Z/actors/hero.json')).toMatchObject({
      controllers: ['ana'],
    });
    expect(await migrateOwnershipFolder(dir)).toBeNull();
  });
});
