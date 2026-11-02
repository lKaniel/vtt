import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { answerRpc, type McpTool } from './mcp-protocol.ts';

// MCP over plain JSON-RPC: what Claude sends a server and what it answers.

const echo: McpTool = {
  name: 'echo',
  description: 'Says it back.',
  input: z.object({ text: z.string() }),
  run: (args: { text: string }) => Promise.resolve(`You said ${args.text}`),
};
const broken: McpTool = {
  name: 'broken',
  description: 'Always fails.',
  input: z.object({}),
  run: () => Promise.reject(new Error('No such game')),
};
const tools = [echo, broken];
const ask = (method: string, params?: unknown) => answerRpc({ jsonrpc: '2.0', id: 1, method, params }, tools);

describe('the MCP protocol', () => {
  it('introduces itself, offering tools, in the version the client asked for', async () => {
    const r = await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'c' } });
    expect(r).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'vtt' } },
    });
  });

  it('answers nothing to a notification', async () => {
    expect(await answerRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools)).toBeUndefined();
  });

  it('lists its tools with JSON schemas for their arguments', async () => {
    const r = await ask('tools/list');
    const listed = (r?.result as { tools: { name: string; inputSchema: { properties?: object } }[] }).tools;
    expect(listed.map((t) => t.name)).toEqual(['echo', 'broken']);
    expect(listed[0]?.inputSchema).toMatchObject({ type: 'object', properties: { text: { type: 'string' } } });
  });

  it('calls a tool, and reports a failed or misused one as a tool error', async () => {
    expect((await ask('tools/call', { name: 'echo', arguments: { text: 'hi' } }))?.result).toEqual({
      content: [{ type: 'text', text: 'You said hi' }],
    });
    expect((await ask('tools/call', { name: 'broken', arguments: {} }))?.result).toEqual({
      content: [{ type: 'text', text: 'No such game' }],
      isError: true,
    });
    const misused = (await ask('tools/call', { name: 'echo', arguments: {} }))?.result as { isError: boolean };
    expect(misused.isError).toBe(true);
  });

  it('refuses unknown methods and tools', async () => {
    expect((await ask('resources/list'))?.error?.code).toBe(-32601);
    expect((await ask('tools/call', { name: 'nope' }))?.error?.code).toBe(-32602);
    expect((await ask('ping'))?.result).toEqual({});
  });
});
