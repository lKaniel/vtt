import { randomUUID } from 'node:crypto';
import type { Op } from '@vtt/core';
import type { Journal, JournalPage } from '@vtt/shared';
import type { ChatMessage } from '@vtt/system-dnd5e';
import { sceneOf } from '../actions/scene-actions.ts';
import { contentFor } from '../library/game-packs.ts';
import { fromDoc } from '../store/doc-sync.ts';
import type { GameStore } from '../store/game-store.ts';
import { type Names, type Picture, pictureOf, stepLines } from './session-events.ts';

// The session log: each evening of play gets a page in the adventure
// book's log (GM-only until the GM shares it) that the server adds a line
// to whenever something worth remembering happens (session-events.ts). A
// page stays open until four hours pass without news. Lines are written
// beside the undo history, not in it, so a player's undo never trips over
// them; undoing the step a line reports takes the line back out.

const QUIET = 4 * 3_600_000;
const EVENTS = 'events';
const MONTHS = 'January February March April May June July August September October November December'.split(' ');

type Page = Journal & { id: string; session: { start: number; end: number } };

interface Line {
  id: string;
  text: string;
}

const bullet = (text: string) => `- ${text}`;
const pad = (n: number) => String(n).padStart(2, '0');

/** A step under way: the table before it (none: no one is playing), and where its cards start. */
export interface Begun {
  before?: Picture;
  from: number;
}

export class SessionLog {
  private cards: ChatMessage[] = [];
  private depth = 0;
  private queued: Line[] = [];
  /** Where each line written went, so undo can take it out again. */
  private written = new Map<string, { page: string; text: string }>();

  constructor(
    private store: GameStore,
    private now: () => number,
    /** Ties a line to the step being recorded, so it follows that step's undo. */
    private mark: (id: string) => void,
    /** Players are at the table: without them the GM is preparing, which isn't news. */
    private playing: () => boolean,
  ) {}

  /** Takes the picture before a step. */
  begin(): Begun {
    this.depth++;
    return { before: this.playing() ? this.picture() : undefined, from: this.cards.length };
  }

  /** A card the step posted. */
  card(card: ChatMessage): void {
    if (this.depth) this.cards.push(card);
  }

  /** The step is done: what changed waits to be written by `flush`. */
  end({ before, from }: Begun): void {
    const cards = this.cards.slice(from);
    if (--this.depth === 0) this.cards = [];
    if (before) this.note(stepLines(before, this.picture(), cards, this.names()));
  }

  private names(): Names {
    return {
      item: (token, id) => contentFor(this.store, token).items.get(id)?.name ?? id,
      scene: (id: string) => this.store.sceneName(id),
    };
  }

  private note(texts: string[]): void {
    for (const text of texts) {
      const id = `log-${randomUUID()}`;
      this.mark(id);
      this.queued.push({ id, text });
    }
  }

  /** Writes the lines of the steps just taken onto this evening's page. */
  flush(): void {
    if (!this.queued.length) return;
    const lines = this.queued;
    this.queued = [];
    const page = this.openPage();
    const add = lines.map((l) => bullet(l.text));
    this.write(page, [...this.eventsOf(page), ...add]);
    for (const l of lines) this.written.set(l.id, { page: page.id, text: l.text });
  }

  /** A step was undone (or redone): the lines it wrote go (or come back). */
  undone(ids: readonly string[], undone: boolean): void {
    for (const id of ids) {
      const line = this.written.get(id);
      const doc = line && this.store.docs.get('journals', line.page);
      if (!line || !doc) continue;
      const page = fromDoc<Page>(doc);
      const lines = this.eventsOf(page);
      if (undone) {
        const at = lines.lastIndexOf(bullet(line.text));
        if (at >= 0) this.write(page, lines.toSpliced(at, 1), false);
      } else this.write(page, [...lines, bullet(line.text)], false);
    }
  }

  private picture(): Picture {
    const store = this.store;
    return pictureOf({
      tokens: store.tokens.values(),
      players: store.world.players,
      combat: store.combat,
      journals: store.docs.all('journals'),
      placeOf: (p) => sceneOf(p, store),
    });
  }

  /** The page of the evening under way, else a new one. */
  private openPage(): Page {
    const now = this.now();
    const pages = this.store.docs
      .all('journals')
      .map((d) => fromDoc<Partial<Page> & { id: string }>(d))
      .filter((j): j is Page => !!j.session && !j.author);
    const last = pages.toSorted((a, b) => b.session.end - a.session.end)[0];
    if (last && now - last.session.end < QUIET) return last;
    return this.newPage(now);
  }

  private newPage(now: number): Page {
    const day = new Date(now);
    const base = `session-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    let id = base;
    let n = 1;
    while (this.store.docs.get('journals', id)) id = `${base}-${++n}`;
    const name = `Session of ${day.getDate()} ${MONTHS[day.getMonth()]} ${day.getFullYear()}`;
    const page: Page = { id, name, book: 'log', session: { start: now, end: now }, pages: [] };
    this.store.applyOps([{ op: 'create', coll: 'journals', doc: { ...page, type: 'journal', rev: 0 } }]);
    return page;
  }

  private eventsOf(page: Page): string[] {
    const text = page.pages.find((p) => p.id === EVENTS)?.text;
    return text ? text.split('\n') : [];
  }

  /** Puts the events page's lines back; `news` moves the evening's end on. */
  private write(page: Page, lines: string[], news = true): void {
    const events: JournalPage = { id: EVENTS, name: 'What happened', kind: 'text', text: lines.join('\n') };
    const has = page.pages.some((p) => p.id === EVENTS);
    const pages = has
      ? page.pages.map((p) => (p.id === EVENTS ? { ...p, text: events.text } : p))
      : [...page.pages, events];
    const patch = { pages, ...(news && { session: { ...page.session, end: this.now() } }) };
    const op: Op = { op: 'update', coll: 'journals', id: page.id, patch };
    this.store.applyOps([op]);
  }
}
