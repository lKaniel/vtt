import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ActorSchema, resolveToken, TokenEntrySchema, TokenSchema } from '@vtt/system-dnd5e';
import { describe, expect, it } from 'vitest';
import { migrateActorsFolder, splitTokens } from './migrate-actors.ts';
import { makeWorld } from './test/fixtures.ts';

const bram = {
  id: 'bram',
  name: 'Bram',
  x: 650,
  y: 650,
  controllers: ['player2'],
  light: { bright: 20, dim: 20 },
  stats: { class: 'Fighter', level: 3, maxHp: 28 },
  hp: 20,
};
const goblin = (id: string, x: number, extra: object = {}) => ({
  id,
  name: 'Goblin',
  x,
  y: 50,
  color: '#4a7a30',
  monster: 'goblin',
  ...extra,
});

/** Every migrated token, resolved, equals the token it was before. */
function expectLossless(before: object[], out: ReturnType<typeof splitTokens>, actors: Map<string, unknown>) {
  const all = new Map([...actors, ...out.actors]);
  out.tokens.forEach((raw, i) => {
    const entry = TokenEntrySchema.parse(raw);
    const actor = entry.actor ? ActorSchema.parse(all.get(entry.actor)) : undefined;
    const { linked: _l, actor: _a, ...token } = resolveToken(entry, actor).token!;
    expect(token).toEqual(TokenSchema.parse(before[i]));
  });
}

describe('splitTokens', () => {
  it('gives a character its own actor and a linked token', () => {
    const out = splitTokens([bram], new Map());
    expect(out.tokens).toEqual([{ id: 'bram', x: 650, y: 650, actor: 'bram', linked: true }]);
    const { x: _x, y: _y, ...sheet } = bram;
    expect(out.actors.get('bram')).toEqual(sheet);
    expectLossless([bram], out, new Map());
  });

  it('makes monsters unlinked copies of one actor, each keeping what is its own', () => {
    const tokens = [goblin('goblin-1', 50, { hidden: false }), goblin('goblin-2', 150, { name: 'Goblin 2', hp: 3 })];
    const out = splitTokens(tokens, new Map());
    expect([...out.actors.keys()]).toEqual(['goblin']);
    expect(out.actors.get('goblin')).toEqual({ id: 'goblin', name: 'Goblin', color: '#4a7a30', monster: 'goblin' });
    expect(out.tokens).toEqual([
      { id: 'goblin-1', x: 50, y: 50, hidden: false, actor: 'goblin', linked: false },
      { id: 'goblin-2', x: 150, y: 50, actor: 'goblin', linked: false, delta: { name: 'Goblin 2', hp: 3 } },
    ]);
    expectLossless(tokens, out, new Map());
  });

  it('reuses an actor of the same monster from the Actors list', () => {
    const actors = new Map<string, unknown>([
      ['goblin', { id: 'goblin', name: 'Goblin', monster: 'goblin', folder: 'Ambush' }],
    ]);
    const tokens = [goblin('g', 50)];
    const out = splitTokens(tokens, actors);
    expect(out.actors.size).toBe(0);
    expect(out.tokens[0]).toMatchObject({ actor: 'goblin', delta: { color: '#4a7a30' } });
    expectLossless(tokens, out, actors);
  });

  it('picks a free actor id when the Actors list already uses it for something else', () => {
    const actors = new Map<string, unknown>([['bram', { id: 'bram', name: 'Other Bram' }]]);
    const out = splitTokens([bram], actors);
    expect(out.tokens[0]).toMatchObject({ actor: 'bram-2', linked: true });
    expect(out.notes).toEqual(['token "bram": its actor is "bram-2" (actors/bram.json was taken)']);
    expectLossless([bram], out, actors);
  });

  it('leaves tokens that already have an actor, and summons, as they are', () => {
    const linked = { id: 'a', x: 0, y: 0, actor: 'bram', linked: true };
    const wolf = { id: 'wolf', name: 'Wolf', x: 0, y: 0, monster: 'wolf', summon: { by: 'bram', spell: 'x' } };
    expect(splitTokens([linked, wolf], new Map()).tokens).toEqual([linked, wolf]);
  });
});

describe('migrateActorsFolder', () => {
  it('splits every scene once, keeping a backup, and marks the game as format 3', async () => {
    const dir = await makeWorld();
    const result = await migrateActorsFolder(dir, { now: new Date('2026-11-01T03:00:00Z') });
    expect(result?.backup).toBe('.v2-backup/2026-11-01T03-00-00Z');
    const read = async (rel: string) => JSON.parse(await readFile(join(dir, rel), 'utf8')) as unknown;
    expect(await read('scenes/main/tokens.json')).toEqual([
      { id: 'hero', x: 150, y: 150, actor: 'hero', linked: true },
      { id: 'goblin', x: 550, y: 150, actor: 'goblin', linked: true },
    ]);
    expect(await read('actors/hero.json')).toEqual({ id: 'hero', name: 'Hero', controllers: ['ana'] });
    expect(await read('game.json')).toMatchObject({ format: 3 });
    const backup = join(dir, result!.backup);
    expect(await readdir(join(backup, 'scenes/main'))).toContain('tokens.json');
    expect(JSON.parse(await readFile(join(backup, 'game.json'), 'utf8'))).not.toHaveProperty('format');
    expect(await migrateActorsFolder(dir)).toBeNull();
  });

  it('stops before changing anything when a tokens file is broken', async () => {
    const dir = await makeWorld();
    await writeFile(join(dir, 'scenes/main/tokens.json'), '[{');
    await expect(migrateActorsFolder(dir)).rejects.toThrow(/tokens.json/);
    expect(JSON.parse(await readFile(join(dir, 'game.json'), 'utf8'))).not.toHaveProperty('format');
  });
});
