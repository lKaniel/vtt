import type { Point } from '@vtt/shared';
import type { ChatMessage, Token } from '@vtt/system-dnd5e';

/** What a Session tells the map and the UI about. */
export interface SessionEvents {
  /** Anything the UI shows changed. */
  change: () => void;
  welcome: () => void;
  chunk: (key: string) => void;
  chunkGone: (key: string) => void;
  token: (token: Token) => void;
  tokenGone: (id: string) => void;
  moved: (id: string, path: Point[]) => void;
  select: (id: string | undefined) => void;
  /** The fight started, ended or moved on. */
  combat: () => void;
  /** An attack or spell was readied or put away. */
  armed: () => void;
  focus: (point: Point) => void;
  /** A chat message arrived live (not the history sent on joining). */
  chat: (message: ChatMessage) => void;
  /** The time of day changed. */
  lighting: () => void;
  /** The editor's mode, tool, menu or documents changed. */
  editor: () => void;
  /** What is selected in the editor changed. */
  selection: () => void;
  /** Explored fog of war changed. */
  fog: () => void;
  /** Your ruler or someone else's moved, or was put away. */
  rulers: () => void;
}
