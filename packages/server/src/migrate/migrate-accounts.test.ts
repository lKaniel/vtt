import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CharacterStore } from '../library/characters.ts';
import { GameHub } from '../library/game-hub.ts';
import { migrateAccounts } from './migrate-accounts.ts';
import { hashSecret } from '../http/secrets.ts';
import { SessionStore } from '../http/sessions.ts';
import { makeWorld } from '../test/fixtures.ts';

// A server from before games had their own players: accounts (one per
// person, the first the admin) sat in games as seats of the same id.

let dataDir: string;
let hub: GameHub;
let characters: CharacterStore;

const vex = {
  id: 'vex-1a2b',
  owner: 'ana',
  name: 'Vex',
  rules: '2014',
  species: 'tiefling',
  class: 'sorcerer',
  background: 'acolyte',
  base: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 15 },
};

async function oldServer(): Promise<void> {
  const account = async (id: string, password: string, extra = {}) =>
    writeFile(
      join(dataDir, 'accounts', `${id}.json`),
      JSON.stringify({ id, name: id, ...(await hashSecret(password)), created: 1, ...extra }),
    );
  await mkdir(join(dataDir, 'accounts'), { recursive: true });
  await account('gm', 'gm-pass', { admin: true, mcpKey: 'abc' });
  await account('ana', 'ana-pass');
  await account('zed', 'zed-pass');
  const expires = Date.now() + 86_400_000;
  await writeFile(
    join(dataDir, 'sessions.json'),
    JSON.stringify({ t1: { account: 'gm', expires }, t2: { account: 'ana', expires } }),
  );
  await mkdir(join(dataDir, 'characters'), { recursive: true });
  await writeFile(join(dataDir, 'characters', 'vex-1a2b.json'), JSON.stringify(vex));
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  hub = new GameHub({ dataDir, home: await makeWorld(), watch: false });
  await hub.load();
  await oldServer();
  characters = new CharacterStore(dataDir);
  await characters.load();
});

afterEach(async () => {
  await hub.close();
});

describe('carrying accounts over to players', () => {
  it("makes the admin account's password the admin password", async () => {
    expect(await migrateAccounts({ dataDir, hub, characters })).toBe(true);
    const sessions = new SessionStore(dataDir);
    await sessions.load();
    const token = await sessions.start();
    expect(await sessions.unlockAdmin(token, 'ana-pass')).toBe(false);
    expect(await sessions.unlockAdmin(token, 'gm-pass')).toBe(true);
  });

  it("gives each player its account's password and Claude key", async () => {
    await migrateAccounts({ dataDir, hub, characters });
    expect(hub.access.locked('test').sort((a, b) => a.localeCompare(b))).toEqual(['ana', 'gm']);
    expect(await hub.access.opens('test', 'ana', 'ana-pass')).toBe(true);
    expect(await hub.access.opens('test', 'ana', 'nope')).toBe(false);
    expect(await hub.access.opens('test', 'bo', null)).toBe(true);
    expect(hub.access.hasMcpKey('test', 'gm')).toBe(true);
  });

  it('keeps signed-in browsers in, as their players', async () => {
    await migrateAccounts({ dataDir, hub, characters });
    const sessions = new SessionStore(dataDir, 'whatever');
    await sessions.load();
    expect(sessions.seatIn('t1', 'test')).toBe('gm');
    expect(sessions.isAdmin('t1')).toBe(true);
    expect(sessions.seatIn('t2', 'test')).toBe('ana');
    expect(sessions.isAdmin('t2')).toBe(false);
  });

  it("moves roster characters into their owner's game, and runs once", async () => {
    await migrateAccounts({ dataDir, hub, characters });
    expect(characters.listFor('test', 'ana').map((c) => c.id)).toEqual(['vex-1a2b']);
    const saved = JSON.parse(await readFile(join(dataDir, 'characters', 'vex-1a2b.json'), 'utf8')) as object;
    expect(saved).toMatchObject({ game: 'test' });
    expect(await stat(join(dataDir, 'accounts-old')).then(() => true)).toBe(true);
    expect(await migrateAccounts({ dataDir, hub, characters })).toBe(false);
  });
});
