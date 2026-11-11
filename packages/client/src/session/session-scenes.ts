import type { Doc, DocRef, DocStore, Op, Patch } from '@vtt/core';
import {
  addLevel,
  duplicateSceneOps,
  editLevel,
  gridSizePatch,
  newSceneOps,
  offLevelUpdates,
  type Player,
  removeLevel,
  type SceneLevel,
  sceneList,
} from '@vtt/shared';
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
  /** The scene you are on. */
  readonly scene: string;
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

  /** A new scene; its id. */
  create(name: string): string {
    const { id, ops } = newSceneOps(this.s.docs, name);
    this.s.edits.sendChanges('new scene', ops);
    return id;
  }

  duplicate(scene: string): void {
    this.s.edits.sendChanges('scene copy', duplicateSceneOps(this.s.docs, scene).ops);
  }

  private levelsOf(scene: string): SceneLevel[] {
    const levels = this.s.docs.get('scenes', scene)?.levels;
    return Array.isArray(levels) ? (levels as SceneLevel[]) : [];
  }

  /** A new floor on top of the scene's others (the first is the ground floor). */
  addLevel(scene: string): void {
    this.edit(scene, { levels: addLevel(this.levelsOf(scene)) });
  }

  /** Renames a floor, moves its heights or what it looks down on. */
  editLevel(scene: string, id: string, patch: Partial<Omit<SceneLevel, 'id'>>): void {
    this.edit(scene, { levels: editLevel(this.levelsOf(scene), id, patch) });
  }

  /** Takes a floor away; what stood on it is then on every floor (one undo step). */
  removeLevel(scene: string, id: string): void {
    const levels = removeLevel(this.levelsOf(scene), id);
    this.on.updates('scene settings', [
      { ref: { coll: 'scenes', id: scene }, patch: { levels: levels.length ? levels : null } },
      ...offLevelUpdates(this.s.docs, scene, id),
    ]);
  }

  /** Changes a scene's settings (name, grid, lighting, fog). */
  edit(scene: string, patch: Patch): void {
    this.on.updates('scene settings', [{ ref: { coll: 'scenes', id: scene }, patch }]);
  }

  /** Sets the scene you are on to squares of `size` pixels (a map picture's own grid). */
  // fallow-ignore-next-line unused-class-member -- editor/menus.ts calls it through MenuApi.scenes
  fitGrid(size: number): void {
    this.edit(this.s.scene, gridSizePatch(size));
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
