import {
  canControl,
  doorAfter,
  type DrawnTile,
  type EngineServerMessage,
  isGm,
  nextImage,
  type Player,
  type Point,
  tilesEntered,
  tileWorks,
  type TriggerAction,
} from '@vtt/shared';
import type { Token } from '@vtt/system-dnd5e';
import { fromDoc } from './doc-sync.ts';
import { shareEntry } from './entry-actions.ts';
import { moveSeats, sceneOf } from './scene-actions.ts';
import { Refusal, type Table } from './table.ts';

// Tile triggers at work, like Monk's Active Tiles (triggers.ts in shared):
// clicking a tile, or walking onto one, runs its actions in order. Regions
// run the same actions as behaviours (region-actions.ts). A teleport takes
// the token away, so the actions after it wait.

/** What triggers send out: chat, a sound for the scene, a journal entry opened for the players. */
export interface TriggerOut {
  say(text: string, gmOnly: boolean): void;
  scene(msg: Extract<EngineServerMessage, { t: 'sound' }>): void;
  show(entry: string, page?: string): void;
}

/** What set the actions off: the tile, and the creature that walked onto it or clicked with. */
export interface TriggerContext {
  tile?: string;
  token?: Token;
}

type Act<T extends TriggerAction['type']> = (a: Extract<TriggerAction, { type: T }>, ctx: TriggerContext) => boolean;

export class TriggerActions {
  constructor(
    private table: Table,
    private out: TriggerOut,
  ) {}

  private get store() {
    return this.table.store;
  }

  private coll(name: string): string {
    return `${this.store.currentScene}/${name}`;
  }

  /** The tiles with a picture on the scene the store reads now. */
  private tiles(): DrawnTile[] {
    return this.store.docs
      .all(this.coll('tiles'))
      .map((d) => fromDoc<DrawnTile>(d))
      .filter((t) => (t.kind as string) !== 'group');
  }

  /** Someone clicked a tile, with one of their creatures (`token`) for the actions that move one. */
  click(player: Player, seen: (id: string) => boolean, msg: { tile: string; token?: string }): void {
    const tile = this.tiles().find((t) => t.id === msg.tile);
    if (!tile || (tile.hidden && !isGm(player))) throw new Refusal('No such tile');
    if (player.role === 'observer') throw new Refusal('Observers only watch');
    if (tile.trigger?.on !== 'click') throw new Refusal('That tile is not clicked');
    if (tile.trigger.gmOnly && !isGm(player)) throw new Refusal('Only the GM may use that');
    const token = msg.token ? this.controlled(player, seen, msg.token) : undefined;
    if (tileWorks(tile)) this.fire(tile, token);
  }

  private controlled(player: Player, seen: (id: string) => boolean, id: string): Token {
    const token = this.store.tokens.get(id);
    if (!token || !seen(id)) throw new Refusal('No such token');
    if (!canControl(token, player)) throw new Refusal(`You don't control ${token.name}`);
    return token;
  }

  /** A token walked along `path`: the tiles it stepped onto, nearest first, run; true when it was taken away. */
  entered(id: string, path: readonly Point[]): boolean {
    for (const { tile } of tilesEntered(this.tiles(), path)) {
      const token = this.store.tokens.get(id);
      if (!token || this.fire(tile, token)) return true;
    }
    return false;
  }

  private fire(tile: DrawnTile, token: Token | undefined): boolean {
    const trigger = tile.trigger!;
    if (trigger.once) {
      const patch = { trigger: { ...trigger, disabled: true } };
      this.store.applyOps([{ op: 'update', coll: this.coll('tiles'), id: tile.id, patch }]);
    }
    return trigger.actions.some((a) => this.run(a, { tile: tile.id, token }));
  }

  /** Runs one action; true when the token was taken away (a teleport). */
  run(action: TriggerAction, ctx: TriggerContext): boolean {
    const acts: { [T in TriggerAction['type']]: Act<T> } = {
      image: (a, c) => this.image(a.tile ?? c.tile, a.images),
      visibility: (a) => this.visibility(a.target, a.to),
      sound: (a) => this.sound(a.src, a.volume),
      teleport: (a, c) => !!c.token && this.teleport(c.token, a.to, a.scene),
      door: (a) => this.door(a.wall, a.to),
      message: (a) => this.say(a.text, !!a.gmOnly),
      journal: (a) => this.journal(a.entry, a.page),
    };
    return (acts[action.type] as Act<TriggerAction['type']>)(action, ctx);
  }

  private sound(src: string, volume: number | undefined): false {
    this.out.scene({ t: 'sound', src, ...(volume !== undefined && { volume }) });
    return false;
  }

  private say(text: string, gmOnly: boolean): false {
    this.out.say(text, gmOnly);
    return false;
  }

  private journal(entry: string, page: string | undefined): false {
    if (shareEntry(this.store, entry)) this.out.show(entry, page);
    return false;
  }

  private update(coll: string, id: string, patch: Record<string, unknown>): void {
    if (this.store.docs.get(this.coll(coll), id))
      this.store.applyOps([{ op: 'update', coll: this.coll(coll), id, patch }]);
  }

  private image(id: string | undefined, images: string[]): false {
    const doc = id ? this.store.docs.get(this.coll('tiles'), id) : undefined;
    if (doc?.kind === 'image') this.update('tiles', doc.id, { src: nextImage(String(doc.src), images) });
    return false;
  }

  private visibility(target: { coll: string; id: string }, to: 'show' | 'hide' | 'toggle'): false {
    const hidden = (now: unknown) => (to === 'toggle' ? !now : to === 'hide');
    if (target.coll === 'tokens') {
      const token = this.store.tokens.get(target.id);
      if (token) this.store.setToken({ ...token, hidden: hidden(token.hidden) });
      return false;
    }
    const doc = this.store.docs.get(this.coll(target.coll), target.id);
    if (doc) this.update(target.coll, target.id, { hidden: hidden(doc.hidden) });
    return false;
  }

  private door(wall: string, to: Extract<TriggerAction, { type: 'door' }>['to']): false {
    const doc = this.store.docs.get(this.coll('walls'), wall);
    if (typeof doc?.door === 'string') this.update('walls', wall, { door: doorAfter(doc.door as 'open', to) });
    return false;
  }

  /** Moves the token to `to`, on this scene or on `scene` (and the players who own it with it). */
  teleport(token: Token, [x, y]: Point, scene?: string): boolean {
    const here = this.store.currentScene;
    if (!scene || scene === here) {
      this.store.setToken({ ...token, x, y });
      return true;
    }
    if (!this.store.hasScene(scene)) return false;
    const doc = this.store.docs.get(`${here}/tokens`, token.id)!;
    this.store.applyOps([
      { op: 'delete', coll: `${here}/tokens`, id: token.id },
      { op: 'create', coll: `${scene}/tokens`, doc: { ...doc, x, y } },
    ]);
    const owners = this.store.world.players.filter(
      (p) => !isGm(p) && canControl(token, p) && sceneOf(p, this.store) === here,
    );
    moveSeats(
      this.store,
      owners.map((p) => p.id),
      scene,
    );
    return true;
  }
}
