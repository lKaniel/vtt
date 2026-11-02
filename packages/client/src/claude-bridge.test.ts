import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './account-api.ts';
import { mcpCommand } from './claude-bridge.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connecting Claude', () => {
  it('gives the command that adds this server to Claude Code', () => {
    expect(mcpCommand('http://localhost:5173', 'vtt_abc')).toBe(
      'claude mcp add --transport http vtt http://localhost:5173/mcp --header "Authorization: Bearer vtt_abc"',
    );
  });

  it('asks the server for, makes and removes the account’s key', async () => {
    const fetch = vi.fn((_path: string, init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init.method === 'POST' ? { key: 'k' } : { has: true }))),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await api.hasMcpKey()).toBe(true);
    expect(await api.newMcpKey()).toBe('k');
    await api.dropMcpKey();
    expect(fetch.mock.calls.map(([path, init]) => `${init.method} ${path}`)).toEqual([
      'GET /api/mcp-key',
      'POST /api/mcp-key',
      'DELETE /api/mcp-key',
    ]);
  });
});
