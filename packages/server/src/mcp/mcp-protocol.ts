import { z } from 'zod';

// The Model Context Protocol as this server speaks it: JSON-RPC 2.0 over
// plain HTTP POSTs (Streamable HTTP without streaming), offering tools only.
// See mcp-tools.ts for the tools and mcp-http.ts for the route.

const PROTOCOL = '2025-06-18';

/** A tool Claude may call: its arguments are checked against `input` first. */
export interface McpTool {
  name: string;
  description: string;
  input: z.ZodType;
  run: (args: never) => Promise<string>;
}

const RequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const CallSchema = z.object({ name: z.string(), arguments: z.unknown().optional() });

export interface RpcAnswer {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError && { isError }) });

function initialize(params: unknown): unknown {
  const asked = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
  return {
    protocolVersion: typeof asked === 'string' ? asked : PROTOCOL,
    capabilities: { tools: {} },
    serverInfo: { name: 'vtt', version: '1.0.0' },
    instructions:
      'A virtual tabletop. Call `guide` first to learn the game format, then `look` to see the table. ' +
      'You act as your own seat at the table, with its rights.',
  };
}

const listTools = (tools: readonly McpTool[]) => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.input) })),
});

async function callTool(params: unknown, tools: readonly McpTool[]): Promise<unknown> {
  const call = CallSchema.safeParse(params);
  const tool = call.success ? tools.find((t) => t.name === call.data.name) : undefined;
  if (!call.success || !tool) throw new RpcError(-32602, 'Unknown tool');
  const args = tool.input.safeParse(call.data.arguments ?? {});
  if (!args.success) return text(`Bad arguments: ${z.prettifyError(args.error)}`, true);
  try {
    return text(await tool.run(args.data as never));
  } catch (e) {
    return text((e as Error).message, true);
  }
}

async function resultOf(method: string, params: unknown, tools: readonly McpTool[]): Promise<unknown> {
  if (method === 'initialize') return initialize(params);
  if (method === 'ping') return {};
  if (method === 'tools/list') return listTools(tools);
  if (method === 'tools/call') return callTool(params, tools);
  throw new RpcError(-32601, `No method ${method}`);
}

/** The answer to one JSON-RPC message; undefined for a notification, which gets none. */
export async function answerRpc(body: unknown, tools: readonly McpTool[]): Promise<RpcAnswer | undefined> {
  const req = RequestSchema.safeParse(body);
  if (!req.success) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } };
  const { id, method, params } = req.data;
  if (id === undefined) return undefined;
  try {
    return { jsonrpc: '2.0', id, result: await resultOf(method, params, tools) };
  } catch (e) {
    const code = e instanceof RpcError ? e.code : -32603;
    return { jsonrpc: '2.0', id, error: { code, message: (e as Error).message } };
  }
}
