import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { AwsClient } from 'aws4fetch';

// Somewhere off the server's own disk to keep copies of the games: an S3
// bucket (Hetzner Object Storage, Backblaze B2, Cloudflare R2, AWS) or a
// folder (a mounted volume or storage box). Keys use forward slashes.

export interface ObjectStore {
  put(key: string, data: Buffer): Promise<void>;
  /** undefined when there is no such object. */
  get(key: string): Promise<Buffer | undefined>;
  /** Every key starting with `prefix`, sorted. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** Where the copies go, for Setup to show (never the secret). */
  describe(): string;
}

/** Objects as files under a folder. */
export class FolderStore implements ObjectStore {
  private root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (relative(this.root, path).startsWith('..')) throw new Error(`Not a key: ${key}`);
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  get(key: string): Promise<Buffer | undefined> {
    return readFile(this.pathOf(key)).catch(() => undefined);
  }

  async list(prefix: string): Promise<string[]> {
    const all = await readdir(this.root, { recursive: true, withFileTypes: true }).catch(() => []);
    return all
      .filter((d) => d.isFile())
      .map((d) => relative(this.root, join(d.parentPath, d.name)).replaceAll('\\', '/'))
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  describe(): string {
    return this.root;
  }
}

export interface S3Options {
  /** e.g. https://fsn1.your-objectstorage.com */
  endpoint: string;
  bucket: string;
  region: string;
  key: string;
  secret: string;
}

/** Objects in an S3 bucket, addressed path-style (endpoint/bucket/key). */
export class S3Store implements ObjectStore {
  private client: AwsClient;
  private base: string;

  constructor(private opts: S3Options) {
    this.client = new AwsClient({
      accessKeyId: opts.key,
      secretAccessKey: opts.secret,
      region: opts.region,
      service: 's3',
    });
    this.base = `${trimSlashes(opts.endpoint)}/${opts.bucket}`;
  }

  private url(key: string): string {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async send(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.client.fetch(url, init);
    if (!res.ok && res.status !== 404) throw new Error(`Backup storage said ${res.status}: ${await res.text()}`);
    return res;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const res = await this.send(this.url(key), { method: 'PUT', body: new Uint8Array(data) });
    if (res.status === 404) throw new Error(`Backup storage said 404: no bucket ${this.opts.bucket}`);
  }

  async get(key: string): Promise<Buffer | undefined> {
    const res = await this.send(this.url(key));
    return res.status === 404 ? undefined : Buffer.from(await res.arrayBuffer());
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const q = new URLSearchParams({ 'list-type': '2', prefix, ...(token && { 'continuation-token': token }) });
      const xml = await (await this.send(`${this.base}?${q.toString()}`)).text();
      keys.push(...tagsOf(xml, 'Key'));
      token = tagsOf(xml, 'IsTruncated')[0] === 'true' ? tagsOf(xml, 'NextContinuationToken')[0] : undefined;
    } while (token);
    return keys.sort((a, b) => a.localeCompare(b));
  }

  async remove(key: string): Promise<void> {
    await this.send(this.url(key), { method: 'DELETE' });
  }

  describe(): string {
    return this.base;
  }
}

/** The text of every `<tag>` in an S3 XML answer. */
function tagsOf(xml: string, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  return xml
    .split(open)
    .slice(1)
    .map((part) => part.split(close)[0]!)
    .map(unescapeXml);
}

function unescapeXml(s: string): string {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function trimSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}
