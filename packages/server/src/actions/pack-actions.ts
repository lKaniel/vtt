import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { enabledPacks, freeId, mediaEntry, type MediaEntry, mediaKind, slugify, withThumbnails } from '@vtt/core';
import { isGm, type Player } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { findGameAssets, gamePackIssues, packInfos } from '../library/game-packs.ts';
import { gamePluginIssues, pluginInfos } from '../library/game-plugins.ts';
import type { GameStore } from '../store/game-store.ts';
import { filesUnder } from '../library/pack-store.ts';
import { fetchPicture } from '../library/url-media.ts';
import { saveBakeFile } from '../library/scene-bakes.ts';
import { Refusal } from '../play/table.ts';

// The GM's asset browser: the packs a game may use, the media of the game
// and its packs, a compendium's documents to copy in, and uploads to the
// game's assets/uploads/. Turning a pack on or off is an op on game.json
// (`packs`), so it undoes like any edit.

type PackMessage = Extract<
  ClientMessage,
  {
    t:
      | 'packs'
      | 'plugins'
      | 'media'
      | 'compendium'
      | 'compendiumDoc'
      | 'findAssets'
      | 'upload'
      | 'uploadUrl'
      | 'bakeBlock';
  }
>;
const KINDS = new Set([
  'packs',
  'plugins',
  'media',
  'compendium',
  'compendiumDoc',
  'findAssets',
  'upload',
  'uploadUrl',
  'bakeBlock',
]);

export const isPackMessage = (msg: ClientMessage): msg is PackMessage => KINDS.has(msg.t);

export class PackActions {
  /** Uploads run one at a time, so two of the same name get different names. */
  private uploads: Promise<unknown> = Promise.resolve();

  constructor(private store: GameStore) {}

  /** Answers one of the GM's pack messages through `reply`; a refusal or failure is answered with an error. */
  handle(player: Player, msg: PackMessage, reply: (msg: ServerMessage) => void): void {
    this.answer(player, msg).then(reply, (e: unknown) => {
      if (!(e instanceof Refusal)) console.error('[game] pack request failed:', e);
      const ref = 'ref' in msg ? msg.ref : undefined;
      const message = e instanceof Refusal ? e.message : failure(msg.t);
      reply({ t: 'error', message, ...(ref && { ref }) });
    });
  }

  private async answer(player: Player, msg: PackMessage): Promise<ServerMessage> {
    if (msg.t === 'plugins') return this.plugins(player);
    if (!isGm(player)) return this.playerUpload(player, msg);
    switch (msg.t) {
      case 'packs':
        return this.list();
      case 'media':
        return { t: 'media', entries: await this.media() };
      case 'compendium':
        return { t: 'compendium', pack: msg.pack, compendium: msg.compendium, docs: this.docs(msg) };
      case 'compendiumDoc':
        return { ...msg, doc: await this.doc(msg) };
      case 'findAssets':
        return { t: 'assets', results: await findGameAssets(this.store, msg.queries, msg.limit ?? 100) };
      case 'upload':
      case 'uploadUrl':
        return this.uploaded(msg, () => this.media());
      case 'bakeBlock':
        await saveBakeFile(this.store, msg);
        return { t: 'bakeSaved', ref: msg.ref };
    }
  }

  /**
   * A player may upload a picture (for a token they own), never other media,
   * and isn't shown the game's files in the answer.
   */
  private playerUpload(player: Player, msg: PackMessage): Promise<ServerMessage> {
    if (msg.t === 'bakeBlock') throw new Refusal('Only the GM can optimise a scene');
    if (msg.t !== 'upload' && msg.t !== 'uploadUrl') throw new Refusal('Only the GM can browse packs');
    if (player.role === 'observer') throw new Refusal('An observer seat only watches');
    if (msg.t === 'upload' && !PICTURE.test(msg.name))
      throw new Refusal('Upload a picture (PNG, JPEG, WebP, GIF or AVIF)');
    return this.uploaded(msg, () => Promise.resolve([]));
  }

  /** Saves a file, one upload at a time, and answers with the `entries` after it and where it went. */
  private async uploaded(
    msg: Extract<PackMessage, { t: 'upload' | 'uploadUrl' }>,
    entries: () => Promise<MediaEntry[]>,
  ) {
    const file = () =>
      msg.t === 'upload'
        ? Promise.resolve({ name: msg.name, data: Buffer.from(msg.data, 'base64') })
        : fetchPicture(msg.url);
    const done = this.uploads.catch(() => undefined).then(async () => this.upload(await file()));
    this.uploads = done;
    const src = await done;
    const { ref } = msg;
    return { t: 'media' as const, entries: await entries(), uploaded: { src, ...(ref && { ref }) } };
  }

  /** The plugins the game may use, read again so ones copied in show up. */
  private async plugins(player: Player): Promise<ServerMessage> {
    if (!isGm(player)) throw new Refusal('Only the GM can manage plugins');
    const { store } = this;
    await store.plugins?.load();
    const problems = [...(store.plugins?.problems ?? []), ...gamePluginIssues(store.plugins, store.campaign)];
    return { t: 'plugins', plugins: pluginInfos(store.plugins, store.campaign), problems };
  }

  private async list(): Promise<ServerMessage> {
    const { store } = this;
    // Pick up packs copied in since the last look.
    await store.packs?.load();
    const problems = [...(store.packs?.problems ?? []), ...gamePackIssues(store.packs, store.campaign, store.system)];
    return { t: 'packs', packs: packInfos(store.packs, store.campaign, store.system), problems };
  }

  private media(): Promise<MediaEntry[]> {
    return gameMedia(this.store);
  }

  /** A compendium of the system's packs or of an installed pack the game may use. */
  private docs({ pack, compendium }: { pack: string; compendium: string }): unknown[] {
    const own = this.store.system.packs?.find((p) => p.manifest.id === pack);
    if (own) return own.compendium(compendium);
    const usable = packInfos(this.store.packs, this.store.campaign, this.store.system).some((p) => p.id === pack);
    const found = usable ? this.store.packs?.compendium(pack, compendium) : undefined;
    if (!found) throw new Refusal(`No compendium "${compendium}" in pack "${pack}"`);
    return found.docs;
  }

  /** One whole document of a compendium; a split one's is read from its file. */
  private async doc({ pack, compendium, id }: { pack: string; compendium: string; id: string }): Promise<unknown> {
    const listed = this.docs({ pack, compendium });
    const own = this.store.system.packs?.some((p) => p.manifest.id === pack);
    const doc = own
      ? listed.find((d) => (d as { id?: unknown }).id === id)
      : await this.store.packs?.compendiumDoc(pack, compendium, id);
    if (doc === undefined) throw new Refusal(`No "${id}" in compendium "${compendium}"`);
    return doc;
  }

  /** Saves an uploaded file as assets/uploads/<name>, numbered if the name is taken; its path in the game. */
  private async upload({ name, data }: { name: string; data: Buffer }): Promise<string> {
    const dot = name.lastIndexOf('.');
    const ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
    if (!mediaKind(`x.${ext}`)) throw new Refusal('Upload a picture, sound or video');
    const dir = join(this.store.dir, 'assets', 'uploads');
    await mkdir(dir, { recursive: true });
    const taken = new Set(await readdir(dir));
    const base = freeId(slugify(name.slice(0, dot)) || 'upload', (id) => taken.has(`${id}.${ext}`), { bare: true });
    await writeFile(join(dir, `${base}.${ext}`), data);
    return `/assets/uploads/${base}.${ext}`;
  }
}

/** The game's own assets, then the media of each pack it uses; video thumbnails become the videos' previews. */
/** The pictures a player may upload (no SVG: it can carry script). */
const PICTURE = /\.(png|jpe?g|webp|gif|avif)$/i;

/** What to tell the GM when a request fails for no reason of theirs. */
const FAILURES: Partial<Record<PackMessage['t'], string>> = {
  uploadUrl: 'Could not download that picture',
  upload: 'Could not save the file',
  bakeBlock: 'Could not save the optimised scene',
};
const failure = (kind: PackMessage['t']) => FAILURES[kind] ?? 'Could not read the packs';

export async function gameMedia(store: GameStore): Promise<MediaEntry[]> {
  // An optimised scene's picture blocks (scene-bakes.ts) are no media to pick.
  const own = await filesUnder(join(store.dir, 'assets'), '', ['baked']);
  const entries = own.flatMap((rel) => mediaEntry(`/assets/${rel}`, rel) ?? []);
  const packs = store.packs;
  if (!packs) return withThumbnails(entries);
  const on = enabledPacks(packs.list(), store.campaign.packs, store.system.id);
  for (const pack of on) entries.push(...(await packs.media(pack.id)));
  return withThumbnails(entries);
}
