import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';
import { SESSION_MAX_AGE, type SessionStore } from './sessions.ts';

// JSON over HTTP for the session and lobby routes (api.ts, lobby-api.ts).

const SESSION_COOKIE = 'vtt_session';
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

/** The request's body as bytes, up to `max`. */
export async function readRaw(req: IncomingMessage, max: number): Promise<Buffer> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readBody(req: IncomingMessage, max: number): Promise<unknown> {
  const text = (await readRaw(req, max)).toString('utf8');
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new HttpError(400, 'Send JSON.');
  }
}

/** The request's JSON, checked; `max` bytes for the few routes that take more than a form's worth. */
export async function parseBody<T>(req: IncomingMessage, schema: z.ZodType<T>, max = MAX_BODY): Promise<T> {
  const parsed = schema.safeParse(await readBody(req, max));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join('; '));
  return parsed.data;
}

export const sessionCookie = (token: string, maxAge: number) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

/** The browser's session token, made (and its cookie set on the answer) if it has none yet. */
export async function ensureSession(sessions: SessionStore, call: Call): Promise<string> {
  if (call.token && sessions.get(call.token)) return call.token;
  const token = await sessions.start();
  call.res.setHeader('set-cookie', sessionCookie(token, SESSION_MAX_AGE));
  call.token = token;
  return token;
}
