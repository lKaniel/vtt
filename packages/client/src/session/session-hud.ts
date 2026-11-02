import type { SessionPart } from './session-part.ts';
import { isGm, type Player, type Point } from '@vtt/shared';
import type { ClientMessage, Condition, TokenView } from '@vtt/system-dnd5e';

// The token HUD: a panel beside one creature you control, with its
// conditions, hit points, elevation and (GM) visibility and place in the
// fight. Also the GM's view through one creature's eyes. Reached as
// `session.hud`.

/** The HUD on screen: which creature, and where it opens (screen pixels). */
export interface OpenHud {
  token: string;
  screen: Point;
}

/** What the HUD needs of the session: the tokens, your seat, and a way to the server. */
export interface HudHost {
  readonly tokens: ReadonlyMap<string, TokenView>;
  readonly you?: Player;
  canControl(token: TokenView): boolean;
  send(msg: ClientMessage): void;
}

/** What the HUD tells the session: something changed, or the map's light must be drawn again. */
export interface HudEvents {
  changed(): void;
  lit(): void;
}

/** The token HUD and the GM's borrowed eyes, as `session.hud`. */
export class Hud implements SessionPart {
  /** The HUD on screen. */
  current?: OpenHud;
  /** GM: the creature whose eyes the map shows, as its players would see. */
  observing?: string;

  constructor(
    private readonly s: HudHost,
    private readonly on: HudEvents,
  ) {}

  /** Opens the HUD beside a creature you control. */
  open(token: string, screen: Point): void {
    const t = this.s.tokens.get(token);
    this.current = t && this.s.canControl(t) ? { token, screen } : undefined;
    this.on.changed();
  }

  close(): void {
    if (!this.current) return;
    this.current = undefined;
    this.on.changed();
  }

  /** GM: sees through a creature's eyes (light, sight and fog as its players get them), or stops. */
  observe(token: string | undefined): void {
    const gm = !!this.s.you && isGm(this.s.you);
    this.observing = gm && token && this.s.tokens.has(token) ? token : undefined;
    this.on.lit();
    this.on.changed();
  }

  /** Puts a condition on a creature, or ends whatever gave it. */
  setCondition(token: string, condition: Condition, on: boolean): void {
    this.s.send({ t: 'condition', token, condition, on });
  }

  /** GM: adds a creature to the fight (starting one) or takes it out. */
  setCombatant(token: string, on: boolean): void {
    this.s.send({ t: 'combatant', token, on });
  }

  /** A token is gone: close its HUD and stop seeing through its eyes. */
  gone(id: string): void {
    if (this.current?.token === id) this.current = undefined;
    if (this.observing === id) this.observing = undefined;
  }
}
