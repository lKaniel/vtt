import { slugify } from '@vtt/core';

// Links and inline rolls in journal text. Our own links name a document:
// @journal[id#page]{label}, @actor[id], @scene[id], @item[id], @spell[id],
// @monster[id]. Foundry's (@UUID[JournalEntry.x]{label}, @Actor[x]) are read
// too; compendium content is looked up by its name. Inline rolls are
// [[/r 2d6+3]] or [[1d4]]{label}, [[/damage 2d6 fire]] rolls the dice, and
// [[/check perception 15]] asks for a check.

export interface ContentLink {
  kind: string;
  id: string;
  page?: string;
}

export interface CheckRef {
  /** An ability ("dex") or a skill ("perception"). */
  name: string;
  dc?: number;
}

export type Piece =
  | { text: string }
  | { link: ContentLink; label?: string }
  | { roll: string; label: string }
  | { check: CheckRef; label: string };

const OURS = new Set(['journal', 'actor', 'scene', 'item', 'spell', 'monster']);
const FOUNDRY: Record<string, string> = { JournalEntry: 'journal', Actor: 'actor', Scene: 'scene', Item: 'item' };
const LINKS = /@([A-Za-z]{1,20})\[([^\]]{1,200})\](?:\{([^}]{0,200})\})?/g;
const INLINE_ROLLS = /\[\[([^[\]]{1,200})\]\](?:\{([^{}]{0,200})\})?/g;
const DICE = /^[\d\s+\-*/()d@kKhHlLmrx<>=!.]+$/;
const ROLLS = new Set([
  '/r',
  '/roll',
  '/gmr',
  '/gmroll',
  '/br',
  '/blindroll',
  '/sr',
  '/selfroll',
  '/pr',
  '/publicroll',
]);

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const text = (t: string): Piece => ({ text: t });

/** A compendium entry by its name: spells, monsters and items we know by id. */
function compendiumLink(parts: string[], label: string | undefined): ContentLink | undefined {
  const coll = parts[2] ?? '';
  const kind = ['spell', 'monster', 'item', 'equipment'].find((k) => coll.includes(k));
  if (!kind || !label) return undefined;
  return { kind: kind === 'equipment' ? 'item' : kind, id: slugify(label) };
}

/** What a Foundry reference ("JournalEntry.x.JournalEntryPage.y") points at. */
function foundryLink(ref: string, label: string | undefined): ContentLink | undefined {
  const parts = ref.split('.');
  if (parts[0] === 'Compendium') return compendiumLink(parts, label);
  const kind = FOUNDRY[parts[0]!];
  if (!kind || !parts[1]) return undefined;
  return { kind, id: parts[1], ...(parts[3] && { page: parts[3] }) };
}

function linkPiece(kind: string, ref: string, label: string | undefined): Piece {
  const lower = kind.toLowerCase();
  if (OURS.has(lower)) {
    const [id, page] = ref.split('#') as [string, string | undefined];
    return { link: { kind: lower, id, ...(page && { page }) }, ...(label && { label }) };
  }
  const link = foundryLink(kind === 'UUID' || kind === 'Compendium' ? ref : `${kind}.${ref}`, label);
  if (!link) return text(label ?? ref);
  return { link, ...(label && { label }) };
}

/** "perception 15", "dex dc=12": what to check and against what. */
function checkRef(args: string[]): CheckRef {
  const dc = args
    .slice(1)
    .map((a) => Number(a.replace(/^dc=/i, '')))
    .find(Number.isFinite);
  return { name: args[0]!.toLowerCase(), ...(dc !== undefined && { dc }) };
}

const checkLabel = (c: CheckRef) => (c.dc === undefined ? '' : `DC ${c.dc} `) + capital(c.name);

type Command = (args: string[], label: string | undefined) => Piece;

const COMMANDS: Record<string, Command> = {
  '/damage': (args, label) => ({ roll: `/r ${args[0]}`, label: label ?? args.join(' ') }),
  '/check': (args, label) => {
    const check = checkRef(args);
    return { check, label: label ?? checkLabel(check) };
  },
  '/save': (args, label) => text(label ?? `${checkLabel(checkRef(args))} save`),
};
COMMANDS['/skill'] = COMMANDS['/check']!;

function commandPiece(body: string, label: string | undefined): Piece {
  const [cmd = '', ...args] = body.split(/\s+/);
  if (ROLLS.has(cmd)) {
    const formula = body.slice(cmd.length).split('#')[0]!.trim();
    return { roll: `${cmd} ${formula}`, label: label ?? formula };
  }
  const command = COMMANDS[cmd];
  return command && args[0] ? command(args, label) : text(label ?? body);
}

function rollPiece(body: string, label: string | undefined): Piece {
  const inner = body.trim();
  if (inner.startsWith('/')) return commandPiece(inner, label);
  if (DICE.test(inner) && /\d/.test(inner)) return { roll: `/r ${inner}`, label: label ?? inner };
  return text(label ?? inner);
}

/** Splits text into plain runs, links, inline rolls and checks. */
export function contentPieces(source: string): Piece[] {
  const found = [
    ...[...source.matchAll(LINKS)].map((m) => ({ m, piece: linkPiece(m[1]!, m[2]!, m[3]) })),
    ...[...source.matchAll(INLINE_ROLLS)].map((m) => ({ m, piece: rollPiece(m[1]!, m[2]) })),
  ].sort((a, b) => a.m.index - b.m.index);
  const out: Piece[] = [];
  let last = 0;
  for (const { m, piece } of found) {
    if (m.index < last) continue;
    if (m.index > last) out.push(text(source.slice(last, m.index)));
    out.push(piece);
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push(text(source.slice(last)));
  return out;
}
