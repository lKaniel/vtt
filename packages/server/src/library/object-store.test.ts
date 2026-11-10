import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FolderStore, type ObjectStore, S3Store } from './object-store.ts';

// A pretend S3 bucket: path-style keys, ListObjectsV2 two keys a page.
const body = async (req: IncomingMessage) => {
  const parts: Buffer[] = [];
  for await (const c of req) parts.push(c as Buffer);
  return Buffer.concat(parts);
};

function listXml(objects: Map<string, Buffer>, url: URL): string {
  const prefix = url.searchParams.get('prefix') ?? '';
  const after = url.searchParams.get('continuation-token') ?? '';
  const keys = [...objects.keys()].filter((k) => k.startsWith(prefix) && k > after).sort((a, b) => a.localeCompare(b));
  const page = keys.slice(0, 2);
  const more = keys.length > 2;
  const contents = page.map((k) => '<Contents><Key>' + k.replaceAll('&', '&amp;') + '</Key></Contents>').join('');
  const next = more ? '<NextContinuationToken>' + page.at(-1)! + '</NextContinuationToken>' : '';
  return `<ListBucketResult>${contents}<IsTruncated>${String(more)}</IsTruncated>${next}</ListBucketResult>`;
}

async function answer(objects: Map<string, Buffer>, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost'); // NOSONAR -- a local test server
  const [, bucket, ...rest] = url.pathname.split('/');
  const key = decodeURIComponent(rest.join('/'));
  if (bucket !== 'games') {
    res.writeHead(404).end();
    return;
  }
  if (req.method === 'PUT') objects.set(key, await body(req));
  if (req.method === 'DELETE') objects.delete(key);
  if (req.method !== 'GET') res.writeHead(200).end();
  else if (!key) res.writeHead(200, { 'content-type': 'application/xml' }).end(listXml(objects, url));
  else res.writeHead(objects.has(key) ? 200 : 404).end(objects.get(key) ?? '<Error><Code>NoSuchKey</Code></Error>');
}

function fakeS3(): Promise<{ server: Server; url: string; objects: Map<string, Buffer>; auth: string[] }> {
  const objects = new Map<string, Buffer>();
  const auth: string[] = [];
  const server = createServer((req, res) => {
    auth.push(req.headers.authorization ?? '');
    void answer(objects, req, res);
  });
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () =>
      done({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, objects, auth }),
    ),
  );
}

let open: Server | undefined;
afterEach(() => {
  open?.close();
  open = undefined;
});

async function behavesLikeAStore(store: ObjectStore): Promise<void> {
  await store.put('nights/2026-11-10/games/a.zip', Buffer.from('one'));
  await store.put('nights/2026-11-10/games/b&c.zip', Buffer.from('two'));
  await store.put('nights/2026-11-11/server.zip', Buffer.from('three'));
  expect((await store.get('nights/2026-11-10/games/a.zip'))?.toString()).toBe('one');
  expect(await store.get('nights/nothing.zip')).toBeUndefined();
  expect(await store.list('nights/2026-11-10/')).toEqual([
    'nights/2026-11-10/games/a.zip',
    'nights/2026-11-10/games/b&c.zip',
  ]);
  await store.remove('nights/2026-11-10/games/a.zip');
  expect(await store.list('nights/')).toEqual(['nights/2026-11-10/games/b&c.zip', 'nights/2026-11-11/server.zip']);
}

describe('object stores for off-server backups', () => {
  it('a folder (a mounted volume or storage box) keeps objects as files', async () => {
    await behavesLikeAStore(new FolderStore(await mkdtemp(join(tmpdir(), 'vtt-offsite-'))));
  });

  it('a folder store refuses keys that climb out of it', async () => {
    const store = new FolderStore(await mkdtemp(join(tmpdir(), 'vtt-offsite-')));
    await expect(store.put('../escape', Buffer.from('x'))).rejects.toThrow();
  });

  it('an S3 bucket is reached path-style with signed requests, listing page by page', async () => {
    const s3 = await fakeS3();
    open = s3.server;
    const store = new S3Store({ endpoint: s3.url, bucket: 'games', region: 'fsn1', key: 'AK', secret: 'SK' });
    await behavesLikeAStore(store);
    expect(s3.auth.every((a) => a.startsWith('AWS4-HMAC-SHA256 Credential=AK/'))).toBe(true);
    expect(store.describe()).toBe(`${s3.url}/games`);
  });

  it('an S3 error says what went wrong', async () => {
    const s3 = await fakeS3();
    open = s3.server;
    const store = new S3Store({ endpoint: s3.url, bucket: 'other', region: 'fsn1', key: 'AK', secret: 'SK' });
    await expect(store.put('x', Buffer.from('x'))).rejects.toThrow(/404/);
  });
});
