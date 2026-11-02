import type { SessionPart } from './session-part.ts';
import type { Doc, DocRef, DocStore, MediaEntry, Op, PackInfo, Patch, PluginInfo } from '@vtt/core';
import {
  ENTRY_TYPES,
  type EntryType,
  importSceneOps,
  pasteAt,
  pasteOffsetTo,
  PrefabSchema,
  type Point,
  type Rect,
  SceneEntrySchema,
  uniqueId,
  type WorldInfo,
} from '@vtt/shared';
import { type Actor, ActorSchema, type ClientMessage, type ServerMessage } from '@vtt/system-dnd5e';
import { setHomebrewSource, setPackContent, setSettingsSource } from './content.ts';

// Asset packs on the client: the rules content of the game's packs (for
// everyone), and for the GM the Assets tab: which packs the game uses, the
// media of the game and its packs, compendia to copy scenes and actors from,
// and uploads. Reached as `session.packs`.

const key = (pack: string, compendium: string) => `${pack}/${compendium}`;

/** What the packs need of the session: documents, the map's view, and ways to the server and the screen. */
export interface PackHost {
  readonly docs: DocStore;
  readonly world?: WorldInfo;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly scene: string;
  send(msg: ClientMessage): void;
  sendChanges(label: string, ops: readonly Op[]): void;
  readonly editor: { viewCentre(): Point };
  saveActor(actor: Actor): void;
  showError(message: string): void;
  showNotice(message: string): void;
}

/** What the packs hand back to the session. */
export interface PackEvents {
  /** Sends field patches as one undo step. */
  updates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void;
  gridSize(): number;
  /** Places a picture as a tile. */
  createImageTile(r: Rect, src: string): void;
}

/** The game's packs, plugins, media and compendia, as `session.packs`. */
export class Packs implements SessionPart {
  /** GM: the packs the game may use, once asked for. */
  list: PackInfo[] = [];
  /** GM: packs the server could not read. */
  problems: string[] = [];
  /** GM: the plugins the game may use, once asked for. */
  plugins: PluginInfo[] = [];
  /** GM: plugins the server could not read, or this game can't load. */
  pluginProblems: string[] = [];
  /** GM: pictures, sounds and videos of the game and its packs, once asked for. */
  media: MediaEntry[] = [];
  private compendia = new Map<string, unknown[]>();

  constructor(
    private readonly s: PackHost,
    private readonly on: PackEvents,
  ) {}

  request(): void {
    this.s.send({ t: 'packs' });
  }

  requestPlugins(): void {
    this.s.send({ t: 'plugins' });
  }

  requestMedia(): void {
    this.s.send({ t: 'media' });
  }

  /** Asks for a compendium's documents the first time. */
  openCompendium(pack: string, compendium: string): void {
    if (!this.compendia.has(key(pack, compendium))) this.s.send({ t: 'compendium', pack, compendium });
  }

  /** A compendium's documents, if they have arrived. */
  compendiumDocs(pack: string, compendium: string): unknown[] | undefined {
    return this.compendia.get(key(pack, compendium));
  }

  /** Turns an installed pack on or off for this game (game.json `packs`). */
  setPackEnabled(pack: string, on: boolean): void {
    this.setInstalled('packs', pack, on);
    this.list = this.list.map((p) => (p.id === pack ? { ...p, enabled: on } : p));
  }

  /** Turns an installed plugin on or off for this game (game.json `plugins`); everyone loads it on joining. */
  setPluginEnabled(plugin: string, on: boolean): void {
    this.setInstalled('plugins', plugin, on);
    this.plugins = this.plugins.map((p) => (p.id === plugin ? { ...p, enabled: on } : p));
  }

  /** Adds `id` to, or takes it from, a list in game.json. */
  private setInstalled(key: 'packs' | 'plugins', id: string, on: boolean): void {
    const game = this.s.docs.all('game')[0];
    if (!game) return;
    const now = Array.isArray(game[key]) ? (game[key] as string[]) : [];
    const list = on ? [...new Set([...now, id])] : now.filter((p) => p !== id);
    const label = `${key === 'packs' ? 'pack' : 'plugin'} ${on ? 'on' : 'off'}`;
    this.on.updates(label, [{ ref: { coll: 'game', id: game.id }, patch: { [key]: list } }]);
  }

  /** Sends a file (base64) to the game's assets/uploads/. */
  upload(name: string, data: string): void {
    this.s.send({ t: 'upload', name, data });
  }

  /** A picture placed as a tile, centred on `at`; `size` defaults to two squares. */
  placeMedia(src: string, at: [number, number], size?: { w: number; h: number }): void {
    const side = this.on.gridSize() * 2;
    const { w, h } = size ?? { w: side, h: side };
    const rect: Rect = { x: Math.round(at[0] - w / 2), y: Math.round(at[1] - h / 2), w, h };
    this.on.createImageTile(rect, src);
  }

  /** A scene from a pack's compendium becomes a new scene of the game. */
  importScene(entry: unknown): void {
    const parsed = SceneEntrySchema.safeParse(entry);
    if (!parsed.success) {
      this.s.showError(`That scene can't be imported: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    this.s.sendChanges('scene import', importSceneOps(this.s.docs, parsed.data).ops);
    this.s.showNotice(`Imported "${parsed.data.name}" into Scenes`);
  }

  /** An actor from a pack's compendium joins the Actors list, in `folder`. */
  importActor(entry: unknown, folder?: string): void {
    const parsed = ActorSchema.safeParse(entry);
    if (!parsed.success) {
      this.s.showError(`That actor can't be imported: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    const actor = parsed.data;
    const id = this.s.actors.has(actor.id) ? uniqueId(actor.name, (x) => this.s.actors.has(x)) : actor.id;
    this.s.saveActor({ ...actor, id, ...(folder ? { folder } : {}) });
  }

  /** A journal entry, roll table or playlist from a compendium joins the sidebar, under a free id. */
  importEntry(type: EntryType, entry: unknown): void {
    const { coll, schema } = ENTRY_TYPES[type];
    const parsed = schema.safeParse(entry);
    if (!parsed.success) {
      this.s.showError(`That ${type} can't be imported: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    const data = parsed.data;
    const taken = (x: string) => !!this.s.docs.get(coll, x);
    const id = taken(data.id) ? uniqueId(data.name, taken) : data.id;
    const doc = { ...data, id, type, rev: 0 } as Doc;
    this.s.sendChanges(`${type} import`, [{ op: 'create', coll, doc }]);
    this.s.showNotice(`Imported "${data.name}"`);
  }

  /** A tile prefab from a compendium, placed with its middle in the middle of the screen. */
  importPrefab(entry: unknown): void {
    const parsed = PrefabSchema.safeParse(entry);
    if (!parsed.success) {
      this.s.showError(`That prefab can't be placed: ${parsed.error.issues[0]?.message ?? 'broken'}`);
      return;
    }
    const clip = { docs: parsed.data.tiles.map((t) => ({ ...t, type: 'tile', rev: 0 })) };
    const offset = pasteOffsetTo(clip, this.s.editor.viewCentre(), this.on.gridSize());
    this.s.sendChanges('prefab', pasteAt(this.s.docs, clip, { scene: this.s.scene, offset }).ops);
  }

  /** A message for the packs: whether the screen changed, or undefined when it is someone else's. */
  receive(msg: ServerMessage): boolean | undefined {
    switch (msg.t) {
      case 'packContent':
        setPackContent(msg.compendia);
        setHomebrewSource(() => this.s.docs.all('homebrew'));
        setSettingsSource(() => this.s.world?.settings);
        return true;
      case 'packs':
        this.list = msg.packs;
        this.problems = msg.problems;
        return true;
      case 'plugins':
        this.plugins = msg.plugins;
        this.pluginProblems = msg.problems;
        return true;
      case 'media':
        this.media = msg.entries;
        return true;
      case 'compendium':
        this.compendia.set(key(msg.pack, msg.compendium), msg.docs);
        return true;
      default:
        return undefined;
    }
  }
}
