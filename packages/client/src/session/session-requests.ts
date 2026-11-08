import type { Actor, CarryChange, CheckKind, ClientMessage } from '@vtt/system-dnd5e';
import type { RollPick } from './session-pick.ts';
import type { Climb } from './session-view3d.ts';
import type { ClockAction, DoorState, MapEdit, Point, Role } from '@vtt/shared';

/**
 * The plain requests a client sends the server, each one message, reached
 * as `session.requests`. The session's parts add the state the UI needs
 * (selection, aiming, sheets).
 */
export class Requests {
  constructor(
    private readonly s: {
      send(msg: ClientMessage): void;
      readonly throughWalls?: { readonly on: boolean };
      readonly view3d?: { readonly on: boolean; readonly climb?: Climb };
      readonly actions?: { readonly pick: RollPick };
    },
  ) {}

  /**
   * Walks `token` there round the walls; with the GM's "ignore walls" on,
   * straight there. In 3D the walk ends as high as what it climbs onto.
   */
  move(token: string, to: Point): void {
    const elevation = this.s.view3d?.on ? this.s.view3d.climb?.(token, to) : undefined;
    this.s.send({
      t: 'move',
      token,
      to,
      ...(this.s.throughWalls?.on && { throughWalls: true }),
      ...(elevation !== undefined && { elevation }),
    });
  }

  setDoor(chunk: string, wall: string, state: DoorState): void {
    this.s.send({ t: 'door', chunk, wall, state });
  }

  /** Clicks a tile that has a trigger, with `token` (one of yours) for the actions that move a creature. */
  useTile(tile: string, token?: string): void {
    this.s.send({ t: 'trigger', tile, ...(token && { token }) });
  }

  editMap(edit: MapEdit): void {
    this.s.send({ t: 'mapEdit', edit });
  }

  setDarkness(darkness: number): void {
    this.s.send({ t: 'darkness', darkness });
  }

  /** GM: start, stop or skip the clock, set the date, change the calendar. */
  clockAction(action: ClockAction): void {
    this.s.send({ t: 'clock', action });
  }

  /** GM: turn-based mode outside a fight, for `tokens` (else the party); `shared`: party members next to each other share a turn. */
  setTurnBased(on: boolean, tokens?: string[], shared = false): void {
    this.s.send({ t: 'turnBased', on, ...(tokens?.length && { tokens }), ...(shared && { shared }) });
  }

  /** Your own options for this game (automation.ts); they replace the old ones. */
  setSeatSettings(settings: Record<string, string>): void {
    this.s.send({ t: 'seatSettings', settings });
  }

  /** GM: the game's rules edition and options (game-settings.ts); they replace the old ones. */
  setGameSettings(rules: string | undefined, settings: Record<string, string>): void {
    this.s.send({ t: 'gameSettings', ...(rules && { rules }), settings });
  }

  /** Picks the animation for one of a creature's attacks or spells; none goes back to the default. */
  setAnimation(token: string, ref: string, animation?: string): void {
    this.s.send({ t: 'animation', token, ref, animation });
  }

  say(text: string): void {
    this.s.send({ t: 'chat', text });
  }

  useFeature(token: string, feature: string): void {
    this.s.send({ t: 'feature', token, feature });
  }

  /** Lets go of a held pool use (a Glamour, a Weave): it ends and frees what it held. */
  // fallow-ignore-next-line unused-class-member -- PoolPanel.tsx calls it through SheetProps.session (fallow --type-aware finds it)
  release(token: string, hold: string): void {
    this.s.send({ t: 'release', token, hold });
  }

  /** Takes a reaction with one of the offered choices, or declines it without one. */
  takeReaction(offer: string, choice?: string): void {
    this.s.send({ t: 'react', offer, ...(choice && { choice }) });
  }

  /** Uses one of an item the token carries (drinks a potion). */
  useItem(token: string, item: string): void {
    this.s.send({ t: 'useItem', token, item });
  }

  rest(tokens: string[], kind: 'short' | 'long'): void {
    this.s.send({ t: 'rest', tokens, kind });
  }

  dropConcentration(token: string): void {
    this.s.send({ t: 'dropConcentration', token });
  }

  removeEffect(token: string, effect: string): void {
    this.s.send({ t: 'removeEffect', token, effect });
  }

  /** GM: pauses the game, or lets it go on. */
  setPaused(on: boolean): void {
    this.s.send({ t: 'pause', on });
  }

  /** Ends `token`'s turn (yours whose turn it is when missing); on a shared turn the others keep theirs. */
  endTurn(token?: string): void {
    this.s.send({ t: 'endTurn', ...(token && { token }) });
  }

  /** GM: a fight; `shared`: party members next to each other share a turn (BG3). */
  startCombat(tokens: string[], shared = false): void {
    this.s.send({ t: 'combatStart', tokens, ...(shared && { shared }) });
  }

  endCombat(): void {
    this.s.send({ t: 'combatEnd' });
  }

  equip(token: string, item: number, equipped: boolean): void {
    this.s.send({ t: 'equip', token, item, equipped });
  }

  /** GM: a legendary action, at `target` when it attacks. */
  legendary(token: string, option: string, target?: string): void {
    this.s.send({ t: 'legendary', token, option, ...(target && { target }) });
  }

  /** GM: a lair action on the lair's turn. */
  lairAction(token: string, action: string): void {
    this.s.send({ t: 'lair', token, action });
  }

  /** GM: asks these creatures for a check, each for itself, as a group or two in a contest. */
  requestCheck(request: Omit<Extract<ClientMessage, { t: 'requestCheck' }>, 't'>): void {
    this.s.send({ t: 'requestCheck', ...request });
  }

  /** Rolls a creature's ability or skill check, on the GM's request card `card` when there is one. */
  rollCheck(token: string, check: CheckKind, card?: string): void {
    this.s.send({ t: 'rollCheck', token, ...check, ...(card && { card }), ...this.s.actions?.pick.takeEdge() });
  }

  /** GM: gives each of these characters `xp` experience points. */
  awardXp(tokens: string[], xp: number): void {
    this.s.send({ t: 'awardXp', tokens, xp });
  }

  /** Takes the next level for a character that is only an actor (actor-level-up.ts in system-dnd5e). */
  levelUp(msg: Omit<Extract<ClientMessage, { t: 'levelUp' }>, 't'>): void {
    this.s.send({ t: 'levelUp', ...msg });
  }

  /** Spends one of the creature's hit dice to heal. */
  spendHitDie(token: string): void {
    this.s.send({ t: 'hitDie', token });
  }

  /** GM: sets a creature's exhaustion (0 for none). */
  setExhaustion(token: string, level: number): void {
    this.s.send({ t: 'exhaustion', token, level });
  }

  /** Coins, packing and attunement on a creature the player controls. */
  carry(token: string, change: CarryChange): void {
    this.s.send({ t: 'carry', token, change });
  }

  /** GM: change what a seat may do at the table. */
  setRole(player: string, role: Role): void {
    this.s.send({ t: 'setRole', player, role });
  }

  /** GM: gives a seat a creature to play (it becomes theirs) or takes it away. */
  setPlays(player: string, actor: string, plays: boolean): void {
    this.s.send({ t: 'setPlays', player, actor, plays });
  }

  /** Saves how the creature's action bar is arranged. */
  setHotbar(token: string, slots: (string | null)[]): void {
    this.s.send({ t: 'hotbar', token, slots });
  }

  editToken(token: string, patch: Record<string, unknown>): void {
    if (Object.keys(patch).length) this.s.send({ t: 'editToken', token, patch });
  }

  deleteToken(token: string): void {
    this.s.send({ t: 'deleteToken', token });
  }

  saveActor(actor: Actor): void {
    this.s.send({ t: 'saveActor', actor });
  }

  deleteActor(id: string): void {
    this.s.send({ t: 'deleteActor', actor: id });
  }

  /** GM: link a token to its actor, unlink it, or save or reset an unlinked copy's changes. */
  relinkToken(token: string, how: 'link' | 'unlink' | 'save' | 'reset'): void {
    this.s.send({ t: 'relinkToken', token, how });
  }
}
