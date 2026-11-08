import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Refusal } from '../play/table.ts';

// A picture the GM points at by its web address, downloaded by the server so
// the game keeps its own copy: other sites often refuse to hand pictures to
// a canvas (no CORS), name them without an extension, or take them down.
// Addresses on the server itself or its private network are refused, so the
// GM can't use the server to look around where they couldn't.

/** The picture types taken from the web, and the extension each is saved with (no SVG: it can carry script). */
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/* eslint-disable sonarjs/no-hardcoded-ip -- the private network ranges refused, not addresses connected to */
const PRIVATE = new BlockList();
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const)
  PRIVATE.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [
  ['::', 127],
  ['fc00::', 7],
  ['fe80::', 10],
  ['::ffff:0:0', 96],
] as const)
  PRIVATE.addSubnet(net, bits, 'ipv6');
/* eslint-enable sonarjs/no-hardcoded-ip */

export interface FetchOptions {
  /** Let addresses on the server's own network through (tests). */
  allowPrivate?: boolean;
  maxBytes?: number;
}

const MAX_BYTES = 20 * 1024 * 1024;
const REDIRECTS = 4;
const TIMEOUT_MS = 20_000;

/** Downloads the picture at `address`: a file name for it (from the address, typed by its content) and its bytes. */
export async function fetchPicture(address: string, opts: FetchOptions = {}): Promise<{ name: string; data: Buffer }> {
  let url = parse(address);
  for (let hop = 0; hop <= REDIRECTS; hop++) {
    if (!opts.allowPrivate) await refusePrivate(url.hostname);
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) {
      url = parse(new URL(next, url).href);
      continue;
    }
    return picture(url, res, opts.maxBytes ?? MAX_BYTES);
  }
  throw new Refusal('That address redirects too many times');
}

function parse(address: string): URL {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Refusal('That is not a web address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Refusal('Only http and https addresses');
  return url;
}

async function refusePrivate(host: string): Promise<void> {
  const bare = host.replace(/^\[|\]$/g, '');
  const ips = isIP(bare) ? [bare] : (await lookup(bare, { all: true })).map((a) => a.address);
  if (ips.some((ip) => PRIVATE.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4')))
    throw new Refusal('That address is on a private network');
}

async function picture(url: URL, res: Response, maxBytes: number): Promise<{ name: string; data: Buffer }> {
  if (!res.ok) throw new Refusal(`The site answered ${res.status}`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Refusal('That address is not a picture');
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Refusal('That picture is too big');
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > maxBytes) throw new Refusal('That picture is too big');
  return { name: `${baseName(url)}.${ext}`, data };
}

/** The last part of the address's path, without its extension; "picture" when there is none. */
function baseName(url: URL): string {
  const last = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
  const dot = last.lastIndexOf('.');
  return (dot > 0 ? last.slice(0, dot) : last) || 'picture';
}
