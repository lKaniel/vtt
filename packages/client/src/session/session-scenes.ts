import type { Doc, DocRef, DocStore, Op, Patch } from '@vtt/core';
import { duplicateSceneOps, newSceneOps, type Player, sceneList } from '@vtt/shared';
import type { ClientMessage, ServerMessage } from '@vtt/system-dnd5e';
import type { SessionPart, Welcome } from './session-part.ts';

// Scenes on the client: the Scenes list's commands (as ops, so undo works
// on them), moving people between scenes, and your seat's own settings.
// Reached as `session.scenes`.

/** What the scenes need of the session: documents, the seats, and a way to the server. */
export interface SceneHost {
  readonly docs: DocStore;
  readonly players: Player[];
  send(msg: ClientMessage): void;
  readonly edits: { sendChanges(label: string, ops: readonly Op[]): void };
}

/** What the scenes hand back to the session. */
export interface SceneEvents {
  /** Sends field patches as one undo step. */
  updates(label: string, updates: readonly { ref: DocRef; patch: Patch }[]): void;
  /** Your seat changed without the table starting over (your settings). */
  reseat(you: Player): void;
}

/** The game's scenes, as `session.scenes`. */
export class Scenes implements SessionPart {
  /** The scene the game is on. */
  active = '';
  /** The name of the scene you are on. */
  name = '';

  constructor(
    private readonly s: SceneHost,
    private readonly on: SceneEvents,
  ) {}

  /** GM: every scene, in the list's order. */
  list(): Doc[] {
    return sceneList(this.s.docs);
  }

  /** GM: the seats on a scene. */
  seatsOn(scene: string): Player[] {
    const scenes = new Set(this.list().map((d) => d.id));
    const where = (p: Player) => (p.scene && scenes.has(p.scene) ? p.scene : this.active);
    return this.s.players.filter((p) => where(p) === scene);
  }

  view(scene: string): void {
    this.s.send({ t: 'viewScene', scene });
  }

  activate(scene: string): void {
    this.s.send({ t: 'activateScene', scene });
  }

  /** Your seat's colour and picture; a null avatar takes it away. */
  setProfile(profile: { color?: string; avatar?: string | null }): void {
    this.s.send({ t: 'profile', ...profile });
  }

  /** Sends one seat to a scene, or (no scene) back to the game's. */
  sendPlayer(player: string, scene?: string): void {
    this.s.send({ t: 'sendPlayer', player, ...(scene ? { scene } : {}) });
  }

  create(name: string): void {
    this.s.edits.sendChanges('new scene', newSceneOps(this.s.docs, name).ops);
  }

  duplicate(scene: string): void {
    this.s.edits.sendChanges('scene copy', duplicateSceneOps(this.s.docs, scene).ops);
  }

  /** Changes a scene's settings (name, grid, lighting, fog). */
  edit(scene: string, patch: Patch): void {
    this.on.updates('scene settings', [{ ref: { coll: 'scenes', id: scene }, patch }]);
  }

  /** Deletes a scene and everything on it; undo brings it all back. */
  delete(scene: string): void {
    this.s.edits.sendChanges('scene delete', [{ op: 'delete', coll: 'scenes', id: scene }]);
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'you') return undefined;
    this.on.reseat(msg.you);
    return true;
  }

  welcome(msg: Welcome): void {
    this.active = msg.active;
    this.name = msg.sceneName ?? msg.scene;
  }
}
