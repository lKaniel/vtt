import type { Actor, CarryChange, ClientMessage } from '@vtt/system-dnd5e';
import type { ClockAction, DoorState, MapEdit, Point, Role } from '@vtt/shared';

/**
 * The plain requests a client sends the server, each one message. Session
 * builds on these with the state the UI needs (selection, aiming, sheets).
 */
export abstract class Commands {
  abstract send(msg: ClientMessage): void;

  move(token: string, to: Point): void {
    this.send({ t: 'move', token, to });
  }

  setDoor(chunk: string, wall: string, state: DoorState): void {
    this.send({ t: 'door', chunk, wall, state });
  }

  /** Clicks a tile that has a trigger, with `token` (one of yours) for the actions that move a creature. */
  useTile(tile: string, token?: string): void {
    this.send({ t: 'trigger', tile, ...(token && { token }) });
  }

  editMap(edit: MapEdit): void {
    this.send({ t: 'mapEdit', edit });
  }

  setDarkness(darkness: number): void {
    this.send({ t: 'darkness', darkness });
  }

  /** GM: start, stop or skip the clock, set the date, change the calendar. */
  clockAction(action: ClockAction): void {
    this.send({ t: 'clock', action });
  }

  /** GM: turn-based mode outside a fight. */
  setTurnBased(on: boolean): void {
    this.send({ t: 'turnBased', on });
  }

  /** Your own options for this game (automation.ts); they replace the old ones. */
  setSeatSettings(settings: Record<string, string>): void {
    this.send({ t: 'seatSettings', settings });
  }

  /** Picks the animation for one of a creature's attacks or spells; none goes back to the default. */
  setAnimation(token: string, ref: string, animation?: string): void {
    this.send({ t: 'animation', token, ref, animation });
  }

  say(text: string): void {
    this.send({ t: 'chat', text });
  }

  useFeature(token: string, feature: string): void {
    this.send({ t: 'feature', token, feature });
  }

  /** Takes a reaction with one of the offered choices, or declines it without one. */
  takeReaction(offer: string, choice?: string): void {
    this.send({ t: 'react', offer, ...(choice && { choice }) });
  }

  /** Uses one of an item the token carries (drinks a potion). */
  useItem(token: string, item: string): void {
    this.send({ t: 'useItem', token, item });
  }

  rest(tokens: string[], kind: 'short' | 'long'): void {
    this.send({ t: 'rest', tokens, kind });
  }

  dropConcentration(token: string): void {
    this.send({ t: 'dropConcentration', token });
  }

  removeEffect(token: string, effect: string): void {
    this.send({ t: 'removeEffect', token, effect });
  }

  endTurn(): void {
    this.send({ t: 'endTurn' });
  }

  startCombat(tokens: string[]): void {
    this.send({ t: 'combatStart', tokens });
  }

  endCombat(): void {
    this.send({ t: 'combatEnd' });
  }

  equip(token: string, item: number, equipped: boolean): void {
    this.send({ t: 'equip', token, item, equipped });
  }

  /** Spends one of the creature's hit dice to heal. */
  spendHitDie(token: string): void {
    this.send({ t: 'hitDie', token });
  }

  /** GM: sets a creature's exhaustion (0 for none). */
  setExhaustion(token: string, level: number): void {
    this.send({ t: 'exhaustion', token, level });
  }

  /** Coins, packing and attunement on a creature the player controls. */
  carry(token: string, change: CarryChange): void {
    this.send({ t: 'carry', token, change });
  }

  /** GM: change what a seat may do at the table. */
  setRole(player: string, role: Role): void {
    this.send({ t: 'setRole', player, role });
  }

  /** Saves how the creature's action bar is arranged. */
  setHotbar(token: string, slots: (string | null)[]): void {
    this.send({ t: 'hotbar', token, slots });
  }

  editToken(token: string, patch: Record<string, unknown>): void {
    if (Object.keys(patch).length) this.send({ t: 'editToken', token, patch });
  }

  deleteToken(token: string): void {
    this.send({ t: 'deleteToken', token });
  }

  saveActor(actor: Actor): void {
    this.send({ t: 'saveActor', actor });
  }

  deleteActor(id: string): void {
    this.send({ t: 'deleteActor', actor: id });
  }

  /** GM: link a token to its actor, unlink it, or save or reset an unlinked copy's changes. */
  relinkToken(token: string, how: 'link' | 'unlink' | 'save' | 'reset'): void {
    this.send({ t: 'relinkToken', token, how });
  }
}
