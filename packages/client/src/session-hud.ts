import type { Point } from '@vtt/shared';
import type { Condition, TokenView } from '@vtt/system-dnd5e';
import { ActionSession } from './session-actions.ts';

// The token HUD: a panel beside one creature you control, with its
// conditions, hit points, elevation and (GM) visibility and place in the
// fight. Also whether the GM has paused the game.

/** The HUD on screen: which creature, and where it opens (screen pixels). */
export interface OpenHud {
  token: string;
  screen: Point;
}

export abstract class HudSession extends ActionSession {
  hud?: OpenHud;
  /** The GM paused the game: players can't act until it resumes. */
  paused = false;

  abstract canControl(token: TokenView): boolean;

  /** Opens the HUD beside a creature you control. */
  openHud(token: string, screen: Point): void {
    const t = this.tokens.get(token);
    this.hud = t && this.canControl(t) ? { token, screen } : undefined;
    this.changed();
  }

  closeHud(): void {
    if (!this.hud) return;
    this.hud = undefined;
    this.changed();
  }

  /** Puts a condition on a creature, or ends whatever gave it. */
  setCondition(token: string, condition: Condition, on: boolean): void {
    this.send({ t: 'condition', token, condition, on });
  }

  /** GM: adds a creature to the fight (starting one) or takes it out. */
  setCombatant(token: string, on: boolean): void {
    this.send({ t: 'combatant', token, on });
  }

  /** GM: pauses the game, or lets it go on. */
  setPaused(on: boolean): void {
    this.send({ t: 'pause', on });
  }

  /** The HUD's creature is gone: close it. */
  protected hudTokenGone(id: string): void {
    if (this.hud?.token === id) this.hud = undefined;
  }
}
