import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './server-api.ts';
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

  it("asks the server for, makes and removes a player's key at a game", async () => {
    const fetch = vi.fn((_path: string, init: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(init.method === 'POST' ? { key: 'k' } : { has: true }))),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await api.hasMcpKey('test')).toBe(true);
    expect(await api.newMcpKey('test')).toBe('k');
    await api.dropMcpKey('test');
    expect(fetch.mock.calls.map(([path, init]) => `${init.method} ${path}`)).toEqual([
      'GET /api/games/test/mcp-key',
      'POST /api/games/test/mcp-key',
      'DELETE /api/games/test/mcp-key',
    ]);
  });
});
