import { levelChoices, levelsSeen, type SceneLevel, tokenLevel, type WorldInfo } from '@vtt/shared';
import type { ClientMessage, ServerMessage, TokenView } from '@vtt/system-dnd5e';
import type { SessionPart } from './session-part.ts';

// The scene level the map shows, as `session.levels`: the GM picks one, a
// player sees the floor their creature stands on (and the floors it looks
// down on). An elevator asks the one moving a creature where it goes.

/** What the levels need of the session: the world, the tokens and who you act with. */
export interface LevelHost {
  readonly world?: WorldInfo;
  readonly selected?: string;
  readonly tokens: ReadonlyMap<string, TokenView>;
  isGm(): boolean;
  canControl(token: TokenView): boolean;
  send(msg: ClientMessage): void;
}

/** What the levels tell the session. */
export interface LevelEvents {
  /** The level shown changed: the map tools redraw. */
  editorChanged(): void;
  /** Something the screen shows changed. */
  changed(): void;
}

/** An elevator's question: where `token` goes. */
export interface LevelChoice {
  token: string;
  levels: SceneLevel[];
}

/** The GM's pick that shows every floor at once. */
export const EVERY_LEVEL = '*';

export class Levels implements SessionPart {
  /** GM: the scene level picked to view and edit, or `EVERY_LEVEL`; none = the selected creature's floor (every level when none is selected). */
  view?: string;
  /** An elevator asks where your creature goes. */
  choice?: LevelChoice;

  constructor(
    private readonly s: LevelHost,
    private readonly on: LevelEvents,
  ) {}

  /**
   * The level the map shows: the GM's pick, else the floor of the creature
   * they selected; for a player the level of the token they act with (else
   * their first). None on a scene without levels, or when the GM shows every level.
   */
  get current(): string | undefined {
    const levels = this.s.world?.levels;
    if (!levels?.length) return undefined;
    const acting = this.s.selected ? this.s.tokens.get(this.s.selected) : undefined;
    if (this.s.isGm()) return this.gmView(acting);
    const eye = acting ?? [...this.s.tokens.values()].find((t) => this.s.canControl(t));
    return eye ? tokenLevel(levels, eye) : undefined;
  }

  private gmView(acting: TokenView | undefined): string | undefined {
    const levels = this.s.world?.levels ?? [];
    if (this.view === EVERY_LEVEL) return undefined;
    if (levels.some((l) => l.id === this.view)) return this.view;
    return acting ? tokenLevel(levels, acting) : undefined;
  }

  /** The levels drawn: the one shown and those it looks down on, bottom first; undefined = every level. */
  get shown(): string[] | undefined {
    return levelsSeen(this.s.world?.levels, this.current);
  }

  /** What a new thing on the map takes so it lands on the floor shown: none when every floor shows. */
  get placing(): { level?: string } {
    const level = this.current;
    return level ? { level } : {};
  }

  setView(level: string | undefined): void {
    this.view = level;
    this.on.editorChanged();
  }

  receive(msg: ServerMessage): boolean | undefined {
    if (msg.t !== 'levelChoice') return undefined;
    const levels = this.s.world?.levels;
    const offered = levelChoices(levels, msg.levels, undefined);
    this.choice = offered.length ? { token: msg.token, levels: offered } : undefined;
    return true;
  }

  /** Takes the creature the elevator asked about to `level`. */
  pick(level: string): void {
    if (!this.choice) return;
    this.s.send({ t: 'changeLevel', token: this.choice.token, level });
    this.dismiss();
  }

  /** Stays on this floor. */
  dismiss(): void {
    this.choice = undefined;
    this.on.changed();
  }
}
