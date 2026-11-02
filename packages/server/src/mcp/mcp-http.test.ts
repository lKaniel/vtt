import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startApi, type ApiServer } from '../test/api-server.ts';

// Claude connects to a running server at /mcp with a key a player made on
// their game's page, and plays as that player.

let api: ApiServer;

beforeEach(async () => {
  api = await startApi({ mcpKey: 'local-secret' });
});

afterEach(async () => {
  await api.close();
});

type Json = Record<string, unknown>;

async function rpc(
  key: string | undefined,
  method: string,
  params?: unknown,
): Promise<{ status: number; json?: Json }> {
  const res = await fetch(`${api.base}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(key && { authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await res.text();
  return { status: res.status, ...(text && { json: JSON.parse(text) as Json }) };
}

const toolText = (r: { json?: Json }) => ((r.json?.result as Json).content as { text: string }[])[0]!.text;

describe('the MCP endpoint', () => {
  it('turns away callers without a key', async () => {
    expect((await rpc(undefined, 'tools/list')).status).toBe(401);
    expect((await rpc('wrong', 'tools/list')).status).toBe(401);
  });

  it('lets a player make a key, and play as that player with it', async () => {
    const gm = await api.joined('test', 'gm');
    expect((await gm('GET', '/api/games/test/mcp-key')).json).toEqual({ has: false });
    const { key } = (await gm('POST', '/api/games/test/mcp-key')).json as { key: string };
    expect((await gm('GET', '/api/games/test/mcp-key')).json).toEqual({ has: true });
    expect(JSON.parse(toolText(await rpc(key, 'tools/call', { name: 'list_games' })))).toEqual({
      games: [{ id: 'test', name: 'Test', role: 'gm' }],
    });
    const seen = JSON.parse(toolText(await rpc(key, 'tools/call', { name: 'look', arguments: {} }))) as Json;
    expect(seen.you).toMatchObject({ id: 'gm', role: 'gm' });
    await gm('DELETE', '/api/games/test/mcp-key');
    expect((await rpc(key, 'tools/list')).status).toBe(401);
  });

  it('takes the server’s own key (VTT_MCP_KEY) as the home game’s GM', async () => {
    const seen = JSON.parse(toolText(await rpc('local-secret', 'tools/call', { name: 'look', arguments: {} }))) as Json;
    expect(seen.you).toMatchObject({ role: 'gm' });
    expect(toolText(await rpc('local-secret', 'tools/call', { name: 'guide' }))).toContain('# ');
  });

  it('answers a notification with 202 and nothing else', async () => {
    const res = await fetch(`${api.base}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer local-secret' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    });
    expect(res.status).toBe(202);
    expect((await fetch(`${api.base}/mcp`, { headers: { authorization: 'Bearer local-secret' } })).status).toBe(405);
  });
});
