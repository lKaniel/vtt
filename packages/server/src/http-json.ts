import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import type { Account, AccountStore } from './accounts.ts';

// JSON over HTTP for the account and lobby routes (api.ts, lobby-api.ts).

export const SESSION_COOKIE = 'vtt_session';
const MAX_BODY = 256 * 1024;

export interface Call {
  req: IncomingMessage;
  res: ServerResponse;
  /** Path parts after /api/. */
  parts: string[];
  method: string;
  token?: string;
}

/** A family of /api/ routes: the first path part says which. */
export interface Routes {
  handles(route: string | undefined): boolean;
  serve(call: Call): Promise<void>;
}

/** A request that can't be served, with the status and message to answer it with. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: string[],
  ) {
    super(message);
  }
}

/** Reads the session token from a request's cookies. */
export function sessionToken(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
}

export function send(res: ServerResponse, status: number, body: unknown, cookie?: string): void {
  res.writeHead(status, { 'content-type': 'application/json', ...(cookie ? { 'set-cookie': cookie } : {}) });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new HttpError(400, 'Send JSON.');
  }
}

export async function parseBody<T>(req: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readBody(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

/** The signed-in account, or a 401. */
export function signedIn(accounts: Pick<AccountStore, 'sessionAccount'>, call: Call): Account {
  const account = accounts.sessionAccount(call.token);
  if (!account) throw new HttpError(401, 'Sign in first.');
  return account;
}
