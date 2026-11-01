import type { MediaEntry, PackInfo } from '@vtt/core';
import { importSceneOps, type Rect, SceneEntrySchema, uniqueId } from '@vtt/shared';
import { type Actor, ActorSchema, type ServerMessage } from '@vtt/system-dnd5e';
import { setPackContent } from './content.ts';
import { SceneSession } from './session-scenes.ts';

// Asset packs on the client: the rules content of the game's packs (for
// everyone), and for the GM the Assets tab: which packs the game uses, the
// media of the game and its packs, compendia to copy scenes and actors from,
// and uploads.

const key = (pack: string, compendium: string) => `${pack}/${compendium}`;

export abstract class PackSession extends SceneSession {
  /** GM: the packs the game may use, once asked for. */
  packs: PackInfo[] = [];
  /** GM: packs the server could not read. */
  packProblems: string[] = [];
  /** GM: pictures, sounds and videos of the game and its packs, once asked for. */
  media: MediaEntry[] = [];
  private compendia = new Map<string, unknown[]>();

  abstract readonly actors: ReadonlyMap<string, Actor>;
  abstract showError(message: string): void;
  abstract showNotice(message: string): void;

  requestPacks(): void {
    this.send({ t: 'packs' });
  }

  requestMedia(): void {
    this.send({ t: 'media' });
  }

  /** Asks for a compendium's documents the first time. */
  openCompendium(pack: string, compendium: string): void {
    if (!this.compendia.has(key(pack, compendium))) this.send({ t: 'compendium', pack, compendium });
  }

  /** A compendium's documents, if they have arrived. */
  compendiumDocs(pack: string, compendium: string): unknown[] | undefined {
    return this.compendia.get(key(pack, compendium));
  }

  /** Turns an installed pack on or off for this game (game.json `packs`). */
  setPackEnabled(pack: string, on: boolean): void {
    const game = this.docs.all('game')[0];
    if (!game) return;
    const now = Array.isArray(game.packs) ? (game.packs as string[]) : [];
    const packs = on ? [...new Set([...now, pack])] : now.filter((p) => p !== pack);
    this.sendUpdates(on ? 'pack on' : 'pack off', [{ ref: { coll: 'game', id: game.id }, patch: { packs } }]);
    this.packs = this.packs.map((p) => (p.id === pack ? { ...p, enabled: on } : p));
  }

  /** Sends a file (base64) to the game's assets/uploads/. */
  upload(name: string, data: string): void {
    this.send({ t: 'upload', name, data });
  }

  /** A picture placed as a tile, centred on `at`; `size` defaults to two squares. */
  placeMedia(src: string, at: [number, number], size?: { w: number; h: number }): void {
    const side = this.gridSize() * 2;
    const { w, h } = size ?? { w: side, h: side };
    const rect: Rect = { x: Math.round(at[0] - w / 2), y: Math.round(at[1] - h / 2), w, h };
    this.createImageTile(rect, src);
  }

  /** A scene from a pack's compendium becomes a new scene of the game. */
  importScene(entry: unknown): void {
    const parsed = SceneEntrySchema.safeParse(entry);
    if (!parsed.success) {
      this.showError(`That scene can't be imported: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    this.sendChanges('scene import', importSceneOps(this.docs, parsed.data).ops);
    this.showNotice(`Imported "${parsed.data.name}" into Scenes`);
  }

  /** An actor from a pack's compendium joins the Actors list, in `folder`. */
  importActor(entry: unknown, folder?: string): void {
    const parsed = ActorSchema.safeParse(entry);
    if (!parsed.success) {
      this.showError(`That actor can't be imported: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    const actor = parsed.data;
    const id = this.actors.has(actor.id) ? uniqueId(actor.name, (x) => this.actors.has(x)) : actor.id;
    this.saveActor({ ...actor, id, ...(folder ? { folder } : {}) });
  }

  protected override applyEdit(msg: ServerMessage): boolean {
    switch (msg.t) {
      case 'packContent':
        setPackContent(msg.compendia);
        return true;
      case 'packs':
        this.packs = msg.packs;
        this.packProblems = msg.problems;
        return true;
      case 'media':
        this.media = msg.entries;
        return true;
      case 'compendium':
        this.compendia.set(key(msg.pack, msg.compendium), msg.docs);
        return true;
      default:
        return super.applyEdit(msg);
    }
  }
}
