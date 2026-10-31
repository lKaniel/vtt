import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountStore, AccountError } from './accounts.ts';

let dir: string;
let accounts: AccountStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vtt-data-'));
  accounts = new AccountStore(dir);
  await accounts.load();
});

describe('AccountStore', () => {
  it('registers an account and signs it in with its password', async () => {
    const account = await accounts.register({ username: 'Kaniel', password: 'hunter22', name: 'Kaniel' });
    expect(account).toMatchObject({ id: 'kaniel', name: 'Kaniel', admin: true });
    expect(await accounts.login('kaniel', 'hunter22')).toMatchObject({ id: 'kaniel' });
    expect(await accounts.login('kaniel', 'wrong')).toBeUndefined();
    expect(await accounts.login('nobody', 'hunter22')).toBeUndefined();
  });

  it('stores a salted hash, never the password', async () => {
    await accounts.register({ username: 'ana', password: 'hunter22', name: 'Ana' });
    const text = await readFile(join(dir, 'accounts', 'ana.json'), 'utf8');
    expect(text).not.toContain('hunter22');
    const saved = JSON.parse(text) as { id: string; salt: string; hash: string };
    expect(saved.id).toBe('ana');
    expect(saved.salt.length).toBeGreaterThan(10);
    expect(saved.hash.length).toBeGreaterThan(40);
  });

  it('makes only the first account the admin', async () => {
    await accounts.register({ username: 'ana', password: 'hunter22', name: 'Ana' });
    expect(await accounts.register({ username: 'bo', password: 'hunter22', name: 'Bo' })).toMatchObject({
      admin: false,
    });
  });

  it('refuses taken names, bad names and short passwords', async () => {
    await accounts.register({ username: 'ana', password: 'hunter22', name: 'Ana' });
    await expect(accounts.register({ username: 'ANA', password: 'hunter22', name: 'A' })).rejects.toThrow(
      'That username is taken.',
    );
    await expect(accounts.register({ username: 'a b!', password: 'hunter22', name: 'A' })).rejects.toThrow(
      AccountError,
    );
    await expect(accounts.register({ username: 'cy', password: '123', name: 'Cy' })).rejects.toThrow(
      'Use a password of at least 6 characters.',
    );
  });

  it('keeps sessions across restarts until signed out', async () => {
    const account = await accounts.register({ username: 'ana', password: 'hunter22', name: 'Ana' });
    const token = await accounts.startSession(account.id);
    const again = new AccountStore(dir);
    await again.load();
    expect(again.sessionAccount(token)?.id).toBe('ana');
    await again.endSession(token);
    expect(again.sessionAccount(token)).toBeUndefined();
    expect(again.sessionAccount('made-up')).toBeUndefined();
  });
});
