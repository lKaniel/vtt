import { isGm, type Point } from '@vtt/shared';
import type { Condition } from '@vtt/system-dnd5e';
import { PileSession } from './session-piles.ts';

// The token HUD: a panel beside one creature you control, with its
// conditions, hit points, elevation and (GM) visibility and place in the
// fight. Also whether the GM has paused the game.

/** The HUD on screen: which creature, and where it opens (screen pixels). */
export interface OpenHud {
  token: string;
  screen: Point;
}

export abstract class HudSession extends PileSession {
  hud?: OpenHud;
  /** The GM paused the game: players can't act until it resumes. */
  paused = false;
  /** GM: the creature whose eyes the map shows, as its players would see. */
  observing?: string;

  /** Opens the HUD beside a creature you control. */
  openHud(token: string, screen: Point): void {
    const t = this.tokens.get(token);
    this.hud = t && this.canControl(t) ? { token, screen } : undefined;
    this.changed();
  }

  /** GM: sees through a creature's eyes (light, sight and fog as its players get them), or stops. */
  observe(token: string | undefined): void {
    const gm = !!this.you && isGm(this.you);
    this.observing = gm && token && this.tokens.has(token) ? token : undefined;
    this.notify('lighting');
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
    if (this.observing === id) this.observing = undefined;
    this.pileGone(id);
  }
}
