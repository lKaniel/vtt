import type { Doc } from '@vtt/core';
import { type Actor, ActorSchema, characterOf, type TokenView } from '@vtt/system-dnd5e';
import { isGm, type Player, type Point } from '@vtt/shared';

// The character you play (system-dnd5e player-character.ts): the actor your
// seat names, else the one you own. Arriving on a scene picks its token
// for you, as Foundry does, and the Actors tab and sheet build on it.

interface Host {
  readonly you?: Player;
  readonly selected?: string;
  /** The GM's Actors list (players are sent the actor documents they may read instead). */
  readonly actors: ReadonlyMap<string, Actor>;
  readonly docs: { all(coll: string): Doc[] };
  readonly tokens: ReadonlyMap<string, TokenView>;
  select(id: string | undefined): void;
  focus(point: Point, gently?: boolean): void;
}

export class MyCharacter {
  constructor(private s: Host) {}

  /** The actors you may read: every one for the GM, a player's own and the ones they observe. */
  actors(): Actor[] {
    if (this.s.you && isGm(this.s.you)) return [...this.s.actors.values()];
    return this.s.docs.all('actors').flatMap((doc) => {
      const r = ActorSchema.safeParse(doc);
      return r.success ? [r.data] : [];
    });
  }

  /** One actor you may read. */
  readActor(id: string): Actor | undefined {
    return this.s.actors.get(id) ?? this.actors().find((a) => a.id === id);
  }

  /** The actor you play, if any. */
  actor(): Actor | undefined {
    return this.s.you && characterOf(this.s.you, this.actors());
  }

  /** Its token on this scene. */
  token(): TokenView | undefined {
    const id = this.actor()?.id;
    return id ? [...this.s.tokens.values()].find((t) => t.actor === id && t.linked) : undefined;
  }

  /** On arriving at a scene (after the welcome) with nothing selected, picks your character and looks at it. */
  arrive(): void {
    if (this.s.selected && this.s.tokens.has(this.s.selected)) return;
    const token = this.token();
    if (!token) return;
    this.s.select(token.id);
    this.s.focus([token.x, token.y], true);
  }
}
