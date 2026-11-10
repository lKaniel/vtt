import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { OffsiteNight, OffsiteStatus } from '@vtt/shared';
import { z } from 'zod';
import { listFolder } from '../store/folder-files.ts';
import { readJson, writeJson } from '../store/json-files.ts';
import type { GameHub } from './game-hub.ts';
import type { ObjectStore } from './object-store.ts';

// A copy of every game off the server's own disk, once a night, in an
// object store. Each file goes up once, named by its hash (blobs/<sha256>);
// a night is lists of which files each game folder held
// (nights/<YYYY-MM-DD>/games/<id>.json, pictures and all) and the server's
// own files (server.json: accounts, characters, the games list). A night
// counts once its done.json is written last. So a night where little
// changed uploads little, and the server never holds a whole game in
// memory. Setup lists the nights and puts a game back from one. The newest
// `keep` nights are kept, and files no kept night names are deleted. Packs,
// the local backups and browser sessions stay behind.

const KEEP = 30;
const HOUR = 3;
const CHECK_MS = 15 * 60_000;
/** Top-level names in the data folder that server.json leaves out. */
const SKIP = ['packs', 'backups', 'games', 'sessions.json', 'offsite.json'];
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export interface OffsiteOptions {
  store: ObjectStore;
  hub: GameHub;
  dataDir: string;
  /** How many nights to keep. */
  keep?: number;
  /** The hour (UTC) after which a night's copy is made. */
  hour?: number;
}

const StateSchema = z.object({
  lastRun: z.object({ at: z.number(), night: z.string(), games: z.number() }).optional(),
  lastError: z.object({ at: z.number(), message: z.string() }).optional(),
});
type State = z.infer<typeof StateSchema>;

const ListSchema = z.object({ files: z.array(z.object({ path: z.string(), hash: z.string() })) });
type FileList = z.infer<typeof ListSchema>;

const byText = (a: string, b: string) => a.localeCompare(b);
const nightOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const listKey = (night: string, id: string) => `nights/${night}/games/${id}.json`;
const blobKey = (hash: string) => `blobs/${hash}`;

export class OffsiteBackups {
  private state: State = {};
  private running = false;
  private timer?: NodeJS.Timeout;

  constructor(private opts: OffsiteOptions) {}

  private get store(): ObjectStore {
    return this.opts.store;
  }

  private get statePath(): string {
    return join(this.opts.dataDir, 'offsite.json');
  }

  private get hour(): number {
    return this.opts.hour ?? HOUR;
  }

  /** Reads when the last night was made, so a restart doesn't make another. */
  async load(): Promise<void> {
    const parsed = StateSchema.safeParse(await readJson(this.statePath));
    this.state = parsed.success ? parsed.data : {};
  }

  status(): OffsiteStatus {
    return { target: this.store.describe(), hour: this.hour, running: this.running, ...this.state };
  }

  /** Tonight's copy is still to make: past the hour, and not made today yet. */
  due(now: number): boolean {
    return new Date(now).getUTCHours() >= this.hour && this.state.lastRun?.night !== nightOf(now);
  }

  /** Checks every so often whether a night's copy is due, and makes it. */
  // fallow-ignore-next-line unused-class-member -- index.ts starts it
  start(): void {
    this.timer = setInterval(() => void this.tick(), CHECK_MS);
    this.timer.unref();
    void this.tick();
  }

  // fallow-ignore-next-line unused-class-member -- index.ts stops it
  stop(): void {
    clearInterval(this.timer);
  }

  private async tick(now = Date.now()): Promise<void> {
    if (this.running || !this.due(now)) return;
    await this.run(now).catch((e: unknown) => console.error('[offsite] the nightly backup failed:', e));
  }

  /** Makes the night's copy now. */
  async run(now = Date.now()): Promise<OffsiteNight> {
    if (this.running) throw new OffsiteError('A backup is being made already.');
    this.running = true;
    try {
      const done = await this.copy(nightOf(now));
      await this.save({ lastRun: { at: Date.now(), night: done.night, games: done.games.length } });
      await this.prune();
      return done;
    } catch (e) {
      const message = (e as Error).message;
      await this.save({ ...this.state, lastError: { at: Date.now(), message } }).catch(() => undefined);
      throw new OffsiteError(message);
    } finally {
      this.running = false;
    }
  }

  private async copy(night: string): Promise<OffsiteNight> {
    const { hub, dataDir } = this.opts;
    const have = new Set(await this.store.list('blobs/'));
    const games = [...hub.ids()].sort(byText);
    for (const id of games) {
      await hub.flush(id);
      const list = await this.upload(hub.dirOf(id)!, [], have);
      await this.putJson(listKey(night, id), list);
    }
    await this.putJson(`nights/${night}/server.json`, await this.upload(dataDir, this.serverSkip(), have));
    await this.putJson(`nights/${night}/done.json`, { at: Date.now(), games });
    return { night, games };
  }

  /** Puts up every file under `dir` the store doesn't have yet; the folder's file list. */
  private async upload(dir: string, skip: string[], have: Set<string>): Promise<FileList> {
    const files: FileList['files'] = [];
    for (const path of await listFolder(dir, skip).catch(() => [])) {
      const data = await readFile(join(dir, path));
      const hash = createHash('sha256').update(data).digest('hex');
      if (!have.has(blobKey(hash))) await this.store.put(blobKey(hash), data);
      have.add(blobKey(hash));
      files.push({ path, hash });
    }
    return { files };
  }

  /** SKIP, and the home game's folder when it sits in the data folder (it has its own list). */
  private serverSkip(): string[] {
    const { hub, dataDir } = this.opts;
    const home = hub.homeId && hub.dirOf(hub.homeId);
    const inside = home ? relative(dataDir, home).replaceAll('\\', '/') : '..';
    return inside.startsWith('..') ? SKIP : [...SKIP, inside.split('/')[0]!];
  }

  private putJson(key: string, value: unknown): Promise<void> {
    return this.store.put(key, Buffer.from(JSON.stringify(value)));
  }

  private async getList(key: string): Promise<FileList | undefined> {
    const buf = await this.store.get(key);
    const parsed = buf && ListSchema.safeParse(JSON.parse(buf.toString('utf8')));
    return parsed?.success ? parsed.data : undefined;
  }

  private async save(state: State): Promise<void> {
    this.state = state;
    await writeJson(this.statePath, state);
  }

  /** The finished nights, newest first. */
  async nights(): Promise<OffsiteNight[]> {
    const keys = await this.store.list('nights/');
    const done = new Set(keys.filter((k) => k.endsWith('/done.json')).map((k) => k.split('/')[1]));
    const byNight = new Map<string, string[]>();
    for (const key of keys) {
      const [, night, kind, file] = key.split('/');
      if (!night || !done.has(night)) continue;
      if (!byNight.has(night)) byNight.set(night, []);
      if (kind === 'games' && file?.endsWith('.json')) byNight.get(night)!.push(file.slice(0, -5));
    }
    return [...byNight].map(([night, games]) => ({ night, games })).sort((a, b) => byText(b.night, a.night));
  }

  /** Drops the nights past `keep`, and then every file no night left names. */
  private async prune(): Promise<void> {
    const nights = await this.nights();
    for (const { night } of nights.slice(this.opts.keep ?? KEEP)) {
      for (const key of await this.store.list(`nights/${night}/`)) await this.store.remove(key);
    }
    const used = await this.usedBlobs();
    for (const key of await this.store.list('blobs/')) if (!used.has(key)) await this.store.remove(key);
  }

  /** The blobs some night's file list names. */
  private async usedBlobs(): Promise<Set<string>> {
    const lists = (await this.store.list('nights/')).filter((k) => !k.endsWith('/done.json'));
    const used = new Set<string>();
    for (const key of lists) for (const f of (await this.getList(key))?.files ?? []) used.add(blobKey(f.hash));
    return used;
  }

  /** Puts game `id` back as it was on `night` (the game as it is now is backed up on the server first). */
  async restore(night: string, id: string): Promise<void> {
    const list = NIGHT.test(night) && !/[/\\]/.test(id) ? await this.getList(listKey(night, id)) : undefined;
    if (!list?.files.some((f) => f.path === 'game.json')) throw new OffsiteError('No such backup.');
    await this.opts.hub.restoreFolder(id, (dir) => this.download(list, dir));
  }

  private async download(list: FileList, dir: string): Promise<void> {
    for (const f of list.files) {
      const data = await this.store.get(blobKey(f.hash));
      if (!data) throw new OffsiteError(`The backup has lost ${f.path}.`);
      const path = join(dir, f.path);
      if (relative(dir, path).startsWith('..')) throw new OffsiteError(`Not a file of a game: ${f.path}`);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    }
  }
}

/** Something Setup asked for that can't be done, with the reason to show. */
export class OffsiteError extends Error {}
