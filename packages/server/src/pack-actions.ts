import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { enabledPacks, freeId, mediaEntry, type MediaEntry, mediaKind, slugify } from '@vtt/core';
import { isGm, type Player } from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import type { ClientMessage } from './client-messages.ts';
import { gamePackIssues, packInfos } from './game-packs.ts';
import type { GameStore } from './game-store.ts';
import { filesUnder } from './pack-store.ts';
import { Refusal } from './table.ts';

// The GM's asset browser: the packs a game may use, the media of the game
// and its packs, a compendium's documents to copy in, and uploads to the
// game's assets/uploads/. Turning a pack on or off is an op on game.json
// (`packs`), so it undoes like any edit.

type PackMessage = Extract<ClientMessage, { t: 'packs' | 'media' | 'compendium' | 'upload' }>;
const KINDS = new Set(['packs', 'media', 'compendium', 'upload']);

export const isPackMessage = (msg: ClientMessage): msg is PackMessage => KINDS.has(msg.t);

export class PackActions {
  /** Uploads run one at a time, so two of the same name get different names. */
  private uploads: Promise<unknown> = Promise.resolve();

  constructor(private store: GameStore) {}

  /** Answers one of the GM's pack messages through `reply`; a refusal or failure is answered with an error. */
  handle(player: Player, msg: PackMessage, reply: (msg: ServerMessage) => void): void {
    this.answer(player, msg).then(reply, (e: unknown) => {
      if (!(e instanceof Refusal)) console.error('[game] pack request failed:', e);
      reply({ t: 'error', message: e instanceof Refusal ? e.message : 'Could not read the packs' });
    });
  }

  private async answer(player: Player, msg: PackMessage): Promise<ServerMessage> {
    if (!isGm(player)) throw new Refusal('Only the GM can browse packs');
    switch (msg.t) {
      case 'packs':
        return this.list();
      case 'media':
        return { t: 'media', entries: await this.media() };
      case 'compendium':
        return { t: 'compendium', pack: msg.pack, compendium: msg.compendium, docs: this.docs(msg) };
      case 'upload': {
        const done = this.uploads.catch(() => undefined).then(() => this.upload(msg.name, msg.data));
        this.uploads = done;
        await done;
        return { t: 'media', entries: await this.media() };
      }
    }
  }

  private async list(): Promise<ServerMessage> {
    const { store } = this;
    // Pick up packs copied in since the last look.
    await store.packs?.load();
    const problems = [...(store.packs?.problems ?? []), ...gamePackIssues(store.packs, store.campaign, store.system)];
    return { t: 'packs', packs: packInfos(store.packs, store.campaign, store.system), problems };
  }

  /** The game's own assets, then the media of each pack it uses. */
  private async media(): Promise<MediaEntry[]> {
    const own = await filesUnder(join(this.store.dir, 'assets'));
    const entries = own.flatMap((rel) => mediaEntry(`/assets/${rel}`, rel) ?? []);
    const packs = this.store.packs;
    if (!packs) return entries;
    const on = enabledPacks(packs.list(), this.store.campaign.packs, this.store.system.id);
    for (const pack of on) entries.push(...(await packs.media(pack.id)));
    return entries;
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

  /** Saves an uploaded file as assets/uploads/<name>, numbered if the name is taken. */
  private async upload(name: string, data: string): Promise<void> {
    const dot = name.lastIndexOf('.');
    const ext = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
    if (!mediaKind(`x.${ext}`)) throw new Refusal('Upload a picture, sound or video');
    const dir = join(this.store.dir, 'assets', 'uploads');
    await mkdir(dir, { recursive: true });
    const taken = new Set(await readdir(dir));
    const base = freeId(slugify(name.slice(0, dot)) || 'upload', (id) => taken.has(`${id}.${ext}`), { bare: true });
    await writeFile(join(dir, `${base}.${ext}`), Buffer.from(data, 'base64'));
  }
}
