import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchPicture } from './url-media.ts';

let server: Server;
let base: string;

const png = Buffer.from('fake png');

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/elf.png') res.writeHead(200, { 'content-type': 'image/png' }).end(png);
    else if (req.url?.startsWith('/render')) res.writeHead(200, { 'content-type': 'image/webp' }).end(png);
    else if (req.url === '/moved') res.writeHead(302, { location: '/elf.png' }).end();
    else if (req.url === '/page') res.writeHead(200, { 'content-type': 'text/html' }).end('<html>');
    else if (req.url === '/big') res.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.alloc(2048));
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

const open = { allowPrivate: true };

describe('fetchPicture', () => {
  it('downloads a picture and names it from the address', async () => {
    const got = await fetchPicture(`${base}/elf.png`, open);
    expect(got.name).toBe('elf.png');
    expect(got.data.toString()).toBe('fake png');
  });

  it('takes the extension from the content type when the address has none', async () => {
    const got = await fetchPicture(`${base}/render?id=7&size=large`, open);
    expect(got.name).toBe('render.webp');
  });

  it('follows redirects', async () => {
    expect((await fetchPicture(`${base}/moved`, open)).name).toBe('elf.png');
  });

  it('refuses pages that are not pictures, missing files and big files', async () => {
    await expect(fetchPicture(`${base}/page`, open)).rejects.toThrow(/not a picture/);
    await expect(fetchPicture(`${base}/nothing.png`, open)).rejects.toThrow(/404/);
    await expect(fetchPicture(`${base}/big`, { ...open, maxBytes: 1024 })).rejects.toThrow(/too big/);
  });

  it('refuses addresses on the server itself or its network, and other schemes', async () => {
    await expect(fetchPicture(`${base}/elf.png`)).rejects.toThrow(/private/);
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- a private address, never fetched
    await expect(fetchPicture('http://10.1.2.3/elf.png')).rejects.toThrow(/private/);
    await expect(fetchPicture('file:///etc/passwd')).rejects.toThrow(/http/);
    await expect(fetchPicture('not a url')).rejects.toThrow(/address/);
  });
});
