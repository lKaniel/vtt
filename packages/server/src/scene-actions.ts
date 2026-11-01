import type { Op } from '@vtt/core';
import { type Player, playPatch, type Playlist, stopPatch } from '@vtt/shared';
import type { ClientMessage } from './client-messages.ts';
import type { GameStore } from './game-store.ts';
import { Refusal, requireGm } from './table.ts';

// Moving people between scenes. Each seat is on the game's scene unless its
// `scene` says otherwise: the GM looking at a scene to prepare it, or a
// player the GM sent elsewhere (a split party). Activating a scene moves the
// game there and brings everyone along, and starts the scene's playlist.

/** The scene a seat is on. */
export function sceneOf(player: Player, store: GameStore): string {
  return player.scene && store.hasScene(player.scene) ? player.scene : store.activeScene;
}

export class SceneActions {
  constructor(private store: GameStore) {}

  /** Runs a scene message; others are left alone. */
  dispatch(player: Player, msg: ClientMessage): void {
    if (msg.t === 'viewScene') this.view(player, msg.scene);
    else if (msg.t === 'activateScene') this.activate(player, msg.scene);
    else if (msg.t === 'sendPlayer') this.send(player, msg.player, msg.scene);
  }

  /** GM: look at another scene; the players stay where they are. */
  view(player: Player, scene: string): void {
    requireGm(player);
    this.place(player.id, this.existing(scene));
  }

  /** GM: the game moves to `scene`, and every seat with it. */
  activate(player: Player, scene: string): void {
    requireGm(player);
    const world = this.store.world;
    const players = world.players.map(({ scene: _gone, ...p }) => p);
    this.store.setGame({ scene: this.existing(scene), players });
    this.startMusic(scene);
  }

  /** A scene's playlist starts as the game moves there; whatever played stops. */
  private startMusic(scene: string): void {
    const docs = this.store.docs;
    const id = docs.get('scenes', scene)?.playlist;
    const next = typeof id === 'string' ? docs.get('playlists', id) : undefined;
    if (!next) return;
    const ops: Op[] = docs
      .all('playlists')
      .filter((p) => p.id !== next.id && (p as unknown as Playlist).tracks.some((t) => t.playing))
      .map((p) => ({ op: 'update', coll: 'playlists', id: p.id, patch: stopPatch(p as unknown as Playlist) }));
    ops.push({ op: 'update', coll: 'playlists', id: next.id, patch: playPatch(next as unknown as Playlist) });
    this.store.applyOps(ops);
  }

  /** GM: put one seat on a scene of its own, or (no scene) back on the game's. */
  send(player: Player, who: string, scene?: string): void {
    requireGm(player);
    if (!this.store.world.players.some((p) => p.id === who)) throw new Refusal('No such player');
    this.place(who, scene === undefined ? this.store.activeScene : this.existing(scene));
  }

  private existing(scene: string): string {
    if (!this.store.hasScene(scene)) throw new Refusal(`There is no scene "${scene}"`);
    return scene;
  }

  private place(who: string, scene: string): void {
    moveSeats(this.store, [who], scene);
  }
}

/** Puts seats on `scene` (on a scene of their own, unless it is the game's). */
export function moveSeats(store: GameStore, who: readonly string[], scene: string): void {
  if (!who.length) return;
  const away = scene === store.activeScene ? undefined : scene;
  const players = store.world.players.map((p) => {
    if (!who.includes(p.id)) return p;
    const { scene: _old, ...seat } = p;
    return away ? { ...seat, scene: away } : seat;
  });
  store.setGame({ players });
}
