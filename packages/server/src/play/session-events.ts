import type { Doc } from '@vtt/core';
import { canControl, canObserve, isGm, type Journal, type Player, type Roll } from '@vtt/shared';
import { characterLevel, type ChatMessage, type Combat, type Token } from '@vtt/system-dnd5e';
import { fromDoc } from '../store/doc-sync.ts';

// What the session log (session-log.ts) notices: a picture of the table
// taken before a step and compared with one after it, plus the chat cards
// the step posted. Each difference is one line of the evening's page.

interface Creature {
  name: string;
  party: boolean;
  down: boolean;
  dead: boolean;
}

/** A party member's sheet: what they carry and how far they've come. */
interface Sheet {
  name: string;
  /** The token whose content names its items. */
  token: Token;
  level?: number;
  /** All their coins, in copper. */
  copper: number;
  items: Map<string, number>;
}

interface QuestState {
  name: string;
  status: string;
  done: Set<string>;
  /** A player may read it: the GM's unshared quests are still prep, not news. */
  shared: boolean;
}

export interface Picture {
  creatures: Map<string, Creature>;
  sheets: Map<string, Sheet>;
  /** The fight on, if any (turn-based mode outside a fight doesn't count). */
  fight?: Pick<Combat, 'round' | 'order'>;
  quests: Map<string, QuestState>;
  /** Where the players' seats are. */
  places: Set<string>;
}

/** What the picture is taken of. */
export interface Table {
  tokens: Iterable<Token>;
  players: readonly Player[];
  combat?: Combat;
  journals: Iterable<Doc>;
  placeOf(player: Player): string;
}

const COPPER = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const;

const copperOf = (t: Token) =>
  Object.entries(t.currency ?? {}).reduce((n, [coin, k]) => n + k * COPPER[coin as keyof typeof COPPER], 0);

function itemsOf(t: Token): Map<string, number> {
  const items = new Map<string, number>();
  for (const e of t.inventory ?? []) items.set(e.item, (items.get(e.item) ?? 0) + e.qty);
  return items;
}

/** One sheet per party member: a linked token speaks for its actor. */
const sheetKey = (t: Token) => (t.actor && t.linked !== false ? `actor:${t.actor}` : `token:${t.id}`);

function questsOf(journals: Iterable<Doc>, players: readonly Player[]): Map<string, QuestState> {
  const quests = new Map<string, QuestState>();
  for (const doc of journals) {
    const j = fromDoc<Journal & { id: string }>(doc);
    if (!j.quest) continue;
    const done = new Set(j.quest.objectives.filter((o) => o.done).map((o) => o.text));
    const shared = players.some((p) => canObserve(j, p));
    quests.set(j.id, { name: j.name, status: j.quest.status, done, shared });
  }
  return quests;
}

export function pictureOf(table: Table): Picture {
  const players = table.players.filter((p) => !isGm(p));
  const creatures = new Map<string, Creature>();
  const sheets = new Map<string, Sheet>();
  for (const t of table.tokens) {
    const party = players.some((p) => canControl(t, p));
    const down = t.hp !== undefined && t.hp <= 0;
    creatures.set(t.id, { name: t.name, party, down, dead: !!t.deathSaves?.dead });
    if (!party) continue;
    const sheet = { name: t.name, token: t, copper: copperOf(t), items: itemsOf(t) };
    sheets.set(sheetKey(t), { ...sheet, level: characterLevel(t.stats) });
  }
  const combat = table.combat && !table.combat.peaceful ? table.combat : undefined;
  return {
    creatures,
    sheets,
    fight: combat && { round: combat.round, order: combat.order },
    quests: questsOf(table.journals, players),
    places: new Set(players.map((p) => table.placeOf(p))),
  };
}

/** How a step's lines name things it can't name from the picture alone. */
export interface Names {
  item(token: Token, id: string): string;
  scene(id: string): string;
}

/** "Goblin ×3, Bugbear": numbered copies ("Goblin 2") counted under one name. */
function crowd(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) {
    const base = n
      .split(' ')
      .filter((w, i, all) => i < all.length - 1 || !/^\d+$/.test(w))
      .join(' ');
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return [...counts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ');
}

function fightLines(before: Picture, after: Picture): string[] {
  if (!before.fight && after.fight) {
    const sides = after.fight.order.map((e) => after.creatures.get(e.token)).filter((c) => !!c);
    const party = sides.filter((c) => c.party).map((c) => c.name);
    const foes = sides.filter((c) => !c.party).map((c) => c.name);
    return [`**Fight:** ${party.join(', ') || 'The party'} against ${crowd(foes) || 'no one'}`];
  }
  if (before.fight && !after.fight) {
    const rounds = before.fight.round;
    return [`The fight ended after ${rounds} round${rounds === 1 ? '' : 's'}`];
  }
  return [];
}

/** Who fell, and to whom when a card of this step names the blow. */
function fallLine(was: Creature, now: Creature, by: string | undefined): string | undefined {
  if (now.dead && !was.dead) return `${now.name} died`;
  if (!now.down || was.down) return undefined;
  if (now.party) return by ? `${by} knocked ${now.name} down` : `${now.name} went down`;
  return by ? `${by} killed ${now.name}` : `${now.name} was killed`;
}

function fallLines(before: Picture, after: Picture, blows: Map<string, string>): string[] {
  return [...after.creatures].flatMap(([id, now]) => {
    const was = before.creatures.get(id);
    const line = was && fallLine(was, now, blows.get(id));
    return line ? [line] : [];
  });
}

/** "12 gp 5 sp" for an amount in copper. */
function coinsText(copper: number): string {
  const parts: string[] = [];
  let left = copper;
  for (const coin of ['gp', 'sp', 'cp'] as const) {
    const k = Math.floor(left / COPPER[coin]);
    left -= k * COPPER[coin];
    if (k) parts.push(`${k} ${coin}`);
  }
  return parts.join(' ');
}

const times = (n: number) => (n > 1 ? ` ×${n}` : '');

function gainedItems(was: Sheet, now: Sheet, names: Names): string[] {
  return [...now.items].flatMap(([item, qty]) => {
    const more = qty - (was.items.get(item) ?? 0);
    return more > 0 ? [`${now.name} got ${names.item(now.token, item)}${times(more)}`] : [];
  });
}

function sheetChanges(was: Sheet, now: Sheet, names: Names): string[] {
  const coins = now.copper > was.copper ? [`${now.name} got ${coinsText(now.copper - was.copper)}`] : [];
  const level = now.level && was.level && now.level > was.level ? [`${now.name} reached level ${now.level}`] : [];
  return [...coins, ...gainedItems(was, now, names), ...level];
}

function sheetLines(before: Picture, after: Picture, names: Names): string[] {
  return [...after.sheets].flatMap(([key, now]) => {
    const was = before.sheets.get(key);
    return was ? sheetChanges(was, now, names) : [];
  });
}

function questChanges(was: QuestState | undefined, now: QuestState): string[] {
  if (!now.shared) return [];
  if (!was?.shared) return [`New quest: ${now.name}`];
  const done = [...now.done].filter((text) => !was.done.has(text)).map((text) => `${now.name}: ${text}, done`);
  const ended = now.status !== was.status && now.status !== 'active';
  return ended ? [...done, `Quest ${now.status === 'done' ? 'done' : 'failed'}: ${now.name}`] : done;
}

function questLines(before: Picture, after: Picture): string[] {
  return [...after.quests].flatMap(([id, now]) => questChanges(before.quests.get(id), now));
}

function placeLines(before: Picture, after: Picture, names: Names): string[] {
  return [...after.places].filter((p) => !before.places.has(p)).map((p) => `The party went to ${names.scene(p)}`);
}

/** The face a d20 roll kept. */
function natural(roll: Roll): number | undefined {
  const term = roll.terms.find((t) => t.rolls.length);
  return term?.rolls.find((_, i) => term.kept[i]);
}

function attackLine(card: ChatMessage): string | undefined {
  const a = card.attack;
  if (!a) return undefined;
  if (a.crit) return `${a.attacker} landed a critical hit on ${a.target} with ${a.attack} (${a.damage} damage)`;
  if (natural(a.d20) === 1) return `${a.attacker} rolled a natural 1 attacking ${a.target}`;
  return undefined;
}

function spellLines(card: ChatMessage): string[] {
  const s = card.spell;
  if (!s) return [];
  return s.results.filter((r) => r.crit).map((r) => `${s.caster}'s ${s.spell} critically hit ${r.target}`);
}

/** The big rolls the step's cards show. */
function rollLines(cards: readonly ChatMessage[]): string[] {
  return cards.flatMap((c) => [attackLine(c), ...spellLines(c)].filter((l): l is string => !!l));
}

/** Who struck each creature in the step's cards (the last blow wins). */
function blowsOf(cards: readonly ChatMessage[]): Map<string, string> {
  const blows = new Map<string, string>();
  for (const c of cards) {
    if (c.attack?.hit) blows.set(c.attack.targetId, c.attack.attacker);
    for (const r of c.spell?.results ?? []) if (r.damage > 0) blows.set(r.targetId, c.spell!.caster);
  }
  return blows;
}

/** The lines one step adds to the log, in the order they happened as best it can tell. */
export function stepLines(before: Picture, after: Picture, cards: readonly ChatMessage[], names: Names): string[] {
  const started = !before.fight && after.fight ? fightLines(before, after) : [];
  const ended = before.fight && !after.fight ? fightLines(before, after) : [];
  return [
    ...placeLines(before, after, names),
    ...started,
    ...rollLines(cards),
    ...fallLines(before, after, blowsOf(cards)),
    ...ended,
    ...sheetLines(before, after, names),
    ...questLines(before, after),
  ];
}
