import { type Change, RevisionError } from '@vtt/core';
import { type HistoryState, isGm, type Player } from '@vtt/shared';
import type { ClientMessage } from './client-messages.ts';
import type { FogChange } from './fog-store.ts';
import type { GameStore } from './game-store.ts';
import { BY_FILES } from './store-history.ts';
import { checkOps, undoOps } from './op-permissions.ts';
import { Refusal, requireGm } from './table.ts';

// Undo and redo (see the design doc, "Edit commands work on everything").
// Each message a client sends is one step: what it changed in the documents.
// Edits are undone by whoever made them, from their own history of 100
// steps; game actions (a move, an attack, a spell) go in one shared list
// that only the GM can undo, because players can't take back a roll.

interface Step {
  /** Order of steps across all histories: the GM's Ctrl+Z takes whichever is newer. */
  seq: number;
  label: string;
  action: boolean;
  changes: Change[];
  /** The GM's fog edits (fog isn't a document, see fog-store.ts). */
  fog: FogChange[];
  /** Chat cards the step posted, marked "undone" while it is. */
  cards: string[];
}

const LIMIT = 100;

/** How a message counts for undo: its name in "Undid the …", and whether it is a game action. */
const STEPS: Partial<Record<ClientMessage['t'], { label: string; action?: boolean }>> = {
  ops: { label: 'edit' },
  editToken: { label: 'token edit' },
  deleteToken: { label: 'delete' },
  relinkToken: { label: 'actor link change' },
  spawn: { label: 'new creature' },
  drop: { label: 'drop' },
  give: { label: 'hand-over', action: true },
  saveActor: { label: 'actor edit' },
  deleteActor: { label: 'actor delete' },
  mapEdit: { label: 'map edit' },
  darkness: { label: 'time of day' },
  clock: { label: 'time change', action: true },
  turnBased: { label: 'turn-based mode', action: true },
  fog: { label: 'fog edit' },
  hotbar: { label: 'action bar change' },
  animation: { label: 'animation choice' },
  rollTable: { label: 'table roll' },
  showJournal: { label: 'journal share' },
  move: { label: 'move', action: true },
  door: { label: 'door', action: true },
  combatStart: { label: 'fight start', action: true },
  combatEnd: { label: 'fight end', action: true },
  endTurn: { label: 'end of turn', action: true },
  attack: { label: 'attack', action: true },
  equip: { label: 'equipment change', action: true },
  carry: { label: 'inventory change', action: true },
  hitDie: { label: 'hit die', action: true },
  exhaustion: { label: 'exhaustion change', action: true },
  cast: { label: 'spell', action: true },
  feature: { label: 'feature use', action: true },
  useItem: { label: 'item use', action: true },
  react: { label: 'reaction', action: true },
  applyDamage: { label: 'applied roll', action: true },
  condition: { label: 'condition', action: true },
  combatant: { label: 'fight change', action: true },
  dropConcentration: { label: 'dropped concentration', action: true },
  removeEffect: { label: 'effect removal', action: true },
  rest: { label: 'rest', action: true },
};

/** Whether a message is a game action (a move, an attack), as opposed to an edit or talk. */
export const isGameAction = (t: string): boolean => !!STEPS[t as ClientMessage['t']]?.action;

const CLOCK_LABELS: Record<string, string> = {
  start: 'clock start',
  stop: 'clock stop',
  skip: 'time skip',
  set: 'date change',
  speed: 'clock speed',
  calendar: 'calendar change',
};

/** "Undid the …": an edit can name itself, a clock change says what it did. */
function labelOf(msg: ClientMessage, label: string): string {
  if (msg.t === 'ops') return msg.label ?? label;
  if (msg.t === 'clock') return CLOCK_LABELS[msg.action.do] ?? label;
  return label;
}

function trimmed(list: Step[]): Step[] {
  return list.length > LIMIT ? list.slice(-LIMIT) : list;
}

export class History {
  private edits = new Map<string, Step[]>();
  private redos = new Map<string, Step[]>();
  private actions: Step[] = [];
  private seq = 0;
  private cards?: string[];

  constructor(
    private store: GameStore,
    private cardsUndone: (ids: string[], undone: boolean) => void,
  ) {}

  /** Runs one client message, recording what it changed as one step; true if it changed anything. */
  run(player: Player, msg: ClientMessage, fn: () => void): boolean {
    const kind = STEPS[msg.t];
    if (!kind) {
      fn();
      return false;
    }
    return this.step(player, { label: labelOf(msg, kind.label), action: !!kind.action }, fn);
  }

  /** Runs `fn`, recording what it changed as one step by `player`; true if it changed anything. */
  step(player: Player, kind: { label: string; action: boolean }, fn: () => void): boolean {
    let error: Error | undefined;
    let fog: FogChange[] = [];
    this.cards = [];
    const changes = this.store.record(player.id, () => {
      fog = this.store.fog.record(() => {
        try {
          fn();
        } catch (e) {
          error = e as Error;
        }
      });
    });
    const cards = this.cards;
    this.cards = undefined;
    // A message refused half way still keeps what it did before that.
    const changed = changes.length > 0 || fog.length > 0;
    if (changed) this.push(player.id, { seq: ++this.seq, ...kind, changes, fog, cards }, true);
    if (error) throw error;
    return changed;
  }

  /** A chat card posted by the step being recorded. */
  noteCard(id: string): void {
    this.cards?.push(id);
  }

  /** Undoes your latest step (the GM's: or the latest action; `card`: the action that card reports). */
  undo(player: Player, card?: string): string {
    const step = card ? this.cardStep(player, card) : this.nextUndo(player);
    if (!step) throw new Refusal('Nothing to undo');
    this.remove(player.id, step);
    const changes = this.revert(player, step, 'undo');
    this.list(this.redos, player.id).push({ ...step, changes });
    if (step.cards.length) this.cardsUndone(step.cards, true);
    return step.label;
  }

  redo(player: Player): string {
    const step = this.list(this.redos, player.id).pop();
    if (!step) throw new Refusal('Nothing to redo');
    const changes = this.revert(player, step, 'redo');
    this.push(player.id, { ...step, seq: ++this.seq, changes }, false);
    if (step.cards.length) this.cardsUndone(step.cards, false);
    return step.label;
  }

  /** What undo and redo would do for `player` now. */
  state(player: Player): HistoryState {
    const card = isGm(player) ? this.actions.at(-1)?.cards[0] : undefined;
    return {
      undo: this.nextUndo(player)?.label,
      redo: this.list(this.redos, player.id).at(-1)?.label,
      card,
    };
  }

  private list(map: Map<string, Step[]>, id: string): Step[] {
    const list = map.get(id) ?? [];
    map.set(id, list);
    return list;
  }

  /** Files a step; a new one (not a redo) starts the redo list over. */
  private push(by: string, step: Step, fresh: boolean): void {
    if (step.action) this.actions = trimmed([...this.actions, step]);
    else this.edits.set(by, trimmed([...this.list(this.edits, by), step]));
    if (!fresh) return;
    this.redos.set(by, []);
    // A new action makes the undone ones before it stale for everyone.
    if (step.action)
      for (const [id, list] of this.redos)
        this.redos.set(
          id,
          list.filter((s) => !s.action),
        );
  }

  private remove(by: string, step: Step): void {
    if (step.action) this.actions = this.actions.filter((s) => s !== step);
    else
      this.edits.set(
        by,
        this.list(this.edits, by).filter((s) => s !== step),
      );
  }

  private nextUndo(player: Player): Step | undefined {
    const own = this.edits.get(player.id)?.at(-1);
    const action = isGm(player) ? this.actions.at(-1) : undefined;
    if (!own || !action) return own ?? action;
    return own.seq > action.seq ? own : action;
  }

  private cardStep(player: Player, card: string): Step {
    requireGm(player);
    const latest = this.actions.at(-1);
    if (!latest?.cards.includes(card)) throw new Refusal('Only the latest action can be undone');
    return latest;
  }

  /** Puts back what a step changed, as a step of its own (whose changes are the way back). */
  private revert(player: Player, step: Step, verb: 'undo' | 'redo'): Change[] {
    this.permit(player, step, verb);
    if (step.fog.length) requireGm(player);
    let changes: Change[];
    try {
      changes = this.store.record(player.id, () => this.store.revert(step.changes));
    } catch (e) {
      if (!(e instanceof RevisionError)) throw e;
      throw new Refusal(`Can't ${verb} the ${step.label}: ${this.conflict(step, e)}`);
    }
    this.rebase(step.changes);
    this.store.fog.revert(step.fog, verb === 'redo');
    return changes;
  }

  /**
   * After a revert, the documents are exactly as they were before the step,
   * only at a new revision: the older steps that left them so may still be
   * undone, so they follow the documents to their new revisions.
   */
  private rebase(reverted: readonly Change[]): void {
    const now = new Map<string, number | undefined>();
    for (const { coll, id, before } of reverted) {
      if (before) now.set(`${coll}\u0000${id}\u0000${before.rev}`, this.store.docs.get(coll, id)?.rev);
    }
    const lists = [this.actions, ...this.edits.values(), ...this.redos.values()];
    for (const step of lists.flat()) {
      step.changes = step.changes.map((c) => {
        const key = `${c.coll}\u0000${c.id}\u0000${c.after}`;
        return now.has(key) ? { ...c, after: now.get(key) } : c;
      });
    }
  }

  /** "Ana has changed Hero since" */
  private conflict(step: Step, e: RevisionError): string {
    const by = this.store.history.lastEditor(e.coll, e.id);
    const who =
      by === BY_FILES
        ? 'someone editing the files'
        : (this.store.world.players.find((p) => p.id === by)?.name ?? 'someone');
    const doc = this.store.docs.get(e.coll, e.id) ?? step.changes.find((c) => c.id === e.id)?.before;
    const name = typeof doc?.name === 'string' ? doc.name : e.id;
    return `${who} has changed ${name} since`;
  }

  /** Undoing is editing: a player may undo only what they could change by hand now. */
  private permit(player: Player, step: Step, verb: 'undo' | 'redo'): void {
    try {
      const access = this.store.access;
      checkOps(player, undoOps(access, step.changes), access);
    } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      throw new Refusal(`You can't ${verb} the ${step.label} any more`);
    }
  }
}
