import type { Actor, ClientMessage, DoorState, MapEdit, Point, Role } from '@vtt/shared';

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

  editMap(edit: MapEdit): void {
    this.send({ t: 'mapEdit', edit });
  }

  setDarkness(darkness: number): void {
    this.send({ t: 'darkness', darkness });
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
}
