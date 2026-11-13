import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// A stand-in for content.baileywiki.com in tests: the sign-in check
// (auth-refresh), file details that hand out a download address for files
// the account may have, and the downloads themselves. Files are given by
// their Baileywiki path; JSON values are served as JSON. It also hands out
// the Content Module (/module/manifest, the zip set as file "module.zip"),
// as foundrymods.com does.

export const GOOD_CODE = 'good-code';
/** The PocketBase role id of Baileywiki's standard (basic1) tier. */
const STANDARD_ROLE = 'ils0rk0o4b2mfux';

export interface FakeBaileywiki {
  base: string;
  /** Files by their Baileywiki path. */
  files: Map<string, unknown>;
  /** Paths whose details were asked for, in order. */
  asked: string[];
  /** Paths the account may not have (403). */
  locked: Set<string>;
  /** Turns every code down from now on, as when a membership lapses. */
  lapse: () => void;
  close: () => Promise<void>;
}

async function body(req: IncomingMessage): Promise<string> {
  let text = '';
  for await (const chunk of req) text += String(chunk);
  return text;
}

/** An answer: a status and a JSON value or raw bytes. */
interface Answer {
  status: number;
  body: unknown;
}

interface FakeState {
  files: Map<string, unknown>;
  asked: string[];
  locked: Set<string>;
  base: string;
  lapsed: boolean;
}

const signedIn = (state: FakeState, req: IncomingMessage) => !state.lapsed && req.headers.authorization === GOOD_CODE;

function refresh(state: FakeState, req: IncomingMessage): Answer {
  if (!signedIn(state, req)) return { status: 401, body: { message: 'no' } };
  return { status: 200, body: { token: GOOD_CODE, record: { id: 'u1', verified: true, roles: [STANDARD_ROLE] } } };
}

async function details(state: FakeState, req: IncomingMessage): Promise<Answer> {
  const path = (JSON.parse(await body(req)) as { file_path: string }).file_path;
  state.asked.push(path);
  if (!signedIn(state, req) || state.locked.has(path)) return { status: 403, body: { message: 'locked' } };
  if (!state.files.has(path)) return { status: 404, body: { message: 'missing' } };
  return { status: 200, body: { url: `${state.base}/download/${encodeURIComponent(path)}`, file: { path } } };
}

function download(state: FakeState, path: string): Answer {
  const value = state.files.get(decodeURIComponent(path));
  return value === undefined ? { status: 404, body: {} } : { status: 200, body: value };
}

async function answer(state: FakeState, req: IncomingMessage): Promise<Answer> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;
  if (route === 'POST /api/collections/users/auth-refresh') return refresh(state, req);
  if (route === 'POST /api/files/file-details') return details(state, req);
  if (route.startsWith('GET /download/')) return download(state, url.pathname.slice('/download/'.length));
  if (route === 'GET /module/manifest') return { status: 200, body: { download: `${state.base}/module/bcm.zip` } };
  if (route === 'GET /module/bcm.zip') return download(state, 'module.zip');
  return { status: 404, body: {} };
}

async function serve(state: FakeState, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { status, body: value } = await answer(state, req);
  if (Buffer.isBuffer(value)) res.writeHead(status).end(value);
  else res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(value));
}

export async function startFakeBaileywiki(): Promise<FakeBaileywiki> {
  const state: FakeState = { files: new Map(), asked: [], locked: new Set(), base: '', lapsed: false };
  const server: Server = createServer((req, res) => {
    serve(state, req, res).catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((done) => server.listen(0, done));
  state.base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return {
    base: state.base,
    files: state.files,
    asked: state.asked,
    locked: state.locked,
    lapse: () => {
      state.lapsed = true;
    },
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/** A small 2D scenes compendium: one town map with a tree tile, and a picture from another module. */
export function townCompendium(fake: FakeBaileywiki): void {
  fake.files.set('bw-content-releases/Compendium/baileywiki-content.maps.json', {
    id: 'baileywiki-content.maps',
    name: 'maps',
    label: 'Baileywiki 2D Scenes',
    type: 'Scene',
    packageName: 'baileywiki-content',
    packageType: 'module',
    index: [{ _id: 'town00000000001', name: 'Town Square', thumb: 'modules/baileywiki-maps-premium/thumbs/town.webp' }],
    folders: [],
  });
  fake.files.set('bw-content-releases/Compendium/baileywiki-content/maps/Scene/town00000000001.json', {
    _id: 'town00000000001',
    name: 'Town Square',
    width: 1000,
    height: 800,
    padding: 0,
    grid: { size: 100, type: 1, distance: 5 },
    background: { src: 'modules/baileywiki-maps-premium/maps/town.webp' },
    tiles: [
      {
        _id: 'tree00000000001',
        x: 100,
        y: 100,
        width: 200,
        height: 200,
        texture: { src: 'modules/baileywiki-maps-premium/tiles/tree%20big.webp' },
      },
      { _id: 'icon00000000001', x: 0, y: 0, width: 100, height: 100, texture: { src: 'modules/jb2a/x.webp' } },
    ],
    walls: [],
    lights: [],
  });
  fake.files.set('modules/baileywiki-maps-premium/maps/town.webp', Buffer.from('town picture'));
  fake.files.set('modules/baileywiki-maps-premium/tiles/tree big.webp', Buffer.from('tree picture'));
}
