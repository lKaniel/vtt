import type { Doc, Patch } from '@vtt/core';
import {
  duplicateSceneOps,
  FOG_BYTES,
  type FogEdit,
  FogMap,
  isGm,
  newSceneOps,
  type Player,
  type Point,
  sceneList,
  unionFog,
} from '@vtt/shared';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { JournalSession } from './session-journal.ts';

// Scenes and fog of war on the client: the Scenes list's commands (as ops,
// so undo works on them), moving people between scenes, the explored fog the
// server sends, and the GM's fog brush.

/** What the GM's fog brush does when it paints. */
export type FogBrush = 'reveal' | 'hide';

/** Default brush radius, in squares. */
const BRUSH_SQUARES = 2;

export abstract class SceneSession extends JournalSession {
  /** The scene the game is on. */
  activeScene = '';
  sceneName = '';
  /** GM: the fog brush in use, if any; clicks and drags on the map paint with it. */
  fogBrush?: FogBrush;
  /** GM: brush radius in squares. */
  fogBrushSize = BRUSH_SQUARES;
  /** GM: the seats fog edits are for (undefined: every player), and whose fog the GM looks at. */
  fogPlayers?: string[];
  /** Explored fog on this scene, by player: your own, or (the GM) every player's. */
  private fog = new Map<string, FogMap>();
  /** Bumped when fog changes, for the map to redraw. */
  fogVersion = 0;

  abstract you?: Player;
  abstract players: Player[];
  /** Explored fog changed. */
  protected abstract fogChanged(): void;

  // Scenes ------------------------------------------------------------------

  /** GM: every scene, in the list's order. */
  sceneList(): Doc[] {
    return sceneList(this.docs);
  }

  /** GM: the seats on a scene. */
  seatsOn(scene: string): Player[] {
    const scenes = new Set(this.sceneList().map((d) => d.id));
    const where = (p: Player) => (p.scene && scenes.has(p.scene) ? p.scene : this.activeScene);
    return this.players.filter((p) => where(p) === scene);
  }

  viewScene(scene: string): void {
    this.send({ t: 'viewScene', scene });
  }

  activateScene(scene: string): void {
    this.send({ t: 'activateScene', scene });
  }

  /** Sends one seat to a scene, or (no scene) back to the game's. */
  sendPlayer(player: string, scene?: string): void {
    this.send({ t: 'sendPlayer', player, ...(scene ? { scene } : {}) });
  }

  createScene(name: string): void {
    this.sendChanges('new scene', newSceneOps(this.docs, name).ops);
  }

  duplicateScene(scene: string): void {
    this.sendChanges('scene copy', duplicateSceneOps(this.docs, scene).ops);
  }

  /** Changes a scene's settings (name, grid, lighting, fog). */
  editScene(scene: string, patch: Patch): void {
    this.sendUpdates('scene settings', [{ ref: { coll: 'scenes', id: scene }, patch }]);
  }

  /** Deletes a scene and everything on it; undo brings it all back. */
  deleteScene(scene: string): void {
    this.sendChanges('scene delete', [{ op: 'delete', coll: 'scenes', id: scene }]);
  }

  // Fog ---------------------------------------------------------------------

  /** A player's explored fog on this scene, as this client knows it. */
  fogOf(player: string): FogMap | undefined {
    return this.fog.get(player);
  }

  /** The fog the map shows: yours, or for the GM the players picked (all: what any of them explored). */
  shownFog(): FogMap | undefined {
    if (!this.you) return undefined;
    if (!isGm(this.you)) return this.fog.get(this.you.id);
    const picked = this.fogPlayers;
    return unionFog([...this.fog].filter(([id]) => !picked || picked.includes(id)).map(([, map]) => map));
  }

  setFogBrush(brush: FogBrush | undefined): void {
    this.fogBrush = brush;
    this.editorChanged();
  }

  setFogBrushSize(squares: number): void {
    this.fogBrushSize = squares;
    this.editorChanged();
  }

  setFogPlayers(players: string[] | undefined): void {
    this.fogPlayers = players;
    this.fogVersion++;
    this.editorChanged();
  }

  /** Paints one stroke of the fog brush through `path`: one edit, one undo. */
  brushFog(path: Point[]): void {
    if (!this.fogBrush || !path.length) return;
    this.sendFog({ op: this.fogBrush, path, radius: this.fogBrushRadius() });
  }

  /** The brush radius in map pixels. */
  fogBrushRadius(): number {
    return this.fogBrushSize * this.gridSize();
  }

  /** Forgets what the players picked have explored on this scene. */
  resetFog(): void {
    this.sendFog({ op: 'reset' });
  }

  private sendFog(edit: FogEdit): void {
    this.send({ t: 'fog', edit: this.fogPlayers ? { ...edit, players: this.fogPlayers } : edit });
  }

  protected override applyEdit(msg: ServerMessage): boolean {
    // Your seat changed without the table starting over (your settings).
    if (msg.t === 'you') return this.reseat(msg.you);
    if (msg.t !== 'fog') return super.applyEdit(msg);
    this.applyFog(msg);
    this.fogChanged();
    return false;
  }

  private reseat(you: Player): boolean {
    this.you = you;
    return true;
  }

  private applyFog(msg: Extract<ServerMessage, { t: 'fog' }>): void {
    let map = this.fog.get(msg.player);
    if (!map || msg.full || map.cell !== msg.cell) {
      map = new FogMap(msg.cell);
      this.fog.set(msg.player, map);
    }
    const blocks = Object.fromEntries(Object.entries(msg.blocks).filter(([, data]) => data));
    const got = FogMap.decode({ cell: msg.cell, blocks });
    for (const key of Object.keys(msg.blocks))
      map.setBlock(key, blocks[key] ? got.block(key) : new Uint8Array(FOG_BYTES));
    this.fogVersion++;
  }

  protected welcomeScenes(msg: Extract<ServerMessage, { t: 'welcome' }>): void {
    this.activeScene = msg.active;
    this.sceneName = msg.sceneName ?? msg.scene;
    this.fog.clear();
    this.fogVersion++;
    if (!isGm(msg.you)) this.fogBrush = undefined;
  }
}
