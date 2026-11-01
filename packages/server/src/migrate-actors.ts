import { join } from 'node:path';
import { deltaOf, placementFields, sameJson, sheetFields, templateFields } from '@vtt/system-dnd5e';
import { uniqueId } from '@vtt/shared';
import { writeJson } from './json-files.ts';
import { backUp, isObject, readActors, readJsonFile, names, readTokenFiles } from './migrate-files.ts';

// Game format 3 splits actors from tokens. Before it, every token in a
// scene's tokens.json carried a whole sheet. Now a character gets an actor
// (actors/<id>.json) and a linked token; monsters become unlinked tokens of
// one actor per monster, each keeping what is its own (wounds, a numbered
// name) in `delta`. Works on the raw JSON, like the storage v2 move, so no
// defaults are written; resolving a migrated token gives back the token it was.

const FORMAT = 3;

type Raw = Record<string, unknown> & { id: string };

export interface SplitResult {
  tokens: unknown[];
  /** New actors to write, by id. */
  actors: Map<string, Raw>;
  notes: string[];
}

const isRaw = (v: unknown): v is Raw =>
  !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as Raw).id === 'string';

/** Characters and other one-of-a-kind creatures share state with their actor; monsters don't. */
function linkedByDefault(sheet: Record<string, unknown>): boolean {
  const controllers = sheet.controllers;
  return (Array.isArray(controllers) && controllers.length > 0) || typeof sheet.monster !== 'string';
}

/** "Goblin 2" without its number. */
function unnumbered(name: string): string {
  const words = name.split(' ');
  return words.length > 1 && /^\d+$/.test(words.at(-1)!) ? words.slice(0, -1).join(' ') : name;
}

class Splitter {
  readonly actors = new Map<string, Raw>();
  readonly notes: string[] = [];

  constructor(private existing: ReadonlyMap<string, unknown>) {}

  token(raw: unknown): unknown {
    if (!isRaw(raw) || raw.actor !== undefined || raw.summon !== undefined) return raw;
    const placement = placementFields(raw);
    const sheet = sheetFields(raw);
    return linkedByDefault(sheet) ? this.linked(raw.id, placement, sheet) : this.copy(placement, sheet);
  }

  private linked(id: string, placement: object, sheet: Record<string, unknown>): object {
    const actor = this.place(id, sheet, (a) => sameJson(sheetFields(a), sheet), `token "${id}"`);
    return { ...placement, actor, linked: true };
  }

  private copy(placement: object, sheet: Record<string, unknown>): object {
    const monster = sheet.monster as string;
    const name = typeof sheet.name === 'string' ? sheet.name : monster;
    const template = { ...templateFields(sheet), name: unnumbered(name) };
    const id = this.place(monster, template, (a) => a.monster === monster, `monster "${monster}"`);
    const delta = deltaOf(sheet, sheetFields(this.actor(id)!));
    return { ...placement, actor: id, linked: false, ...(Object.keys(delta).length ? { delta } : {}) };
  }

  private actor(id: string): Raw | undefined {
    const found = this.actors.get(id) ?? this.existing.get(id);
    return isRaw(found) ? found : undefined;
  }

  /** The id of an actor that fits (`fits`), or of a new one made from `sheet`. */
  private place(want: string, sheet: Record<string, unknown>, fits: (a: Raw) => boolean, what: string): string {
    const taken = (id: string) => this.actors.has(id) || this.existing.has(id);
    const current = this.actor(want);
    if (current && fits(current)) return want;
    const id = taken(want) ? uniqueId(want, taken) : want;
    if (id !== want) this.notes.push(`${what}: its actor is "${id}" (actors/${want}.json was taken)`);
    this.actors.set(id, { id, ...sheet });
    return id;
  }
}

/** One scene's tokens in format 3, and the actors they need. `actors` is the Actors list so far. */
export function splitTokens(tokens: readonly unknown[], actors: ReadonlyMap<string, unknown>): SplitResult {
  const splitter = new Splitter(actors);
  return { tokens: tokens.map((t) => splitter.token(t)), actors: splitter.actors, notes: splitter.notes };
}

export interface MigratedActors {
  backup: string;
  notes: string[];
}

/**
 * Moves a game folder to format 3 in place: actors split from tokens.
 * Returns null when it is already there (or has no game.json). The scenes,
 * actors and game.json are copied to `.v2-backup/<time>/` first, a broken
 * file stops the move before anything changes, and game.json is written
 * last, so a move cut short is redone on the next start.
 */
export async function migrateActorsFolder(dir: string, { now = new Date() } = {}): Promise<MigratedActors | null> {
  if (!(await names(dir, '.')).includes('game.json')) return null;
  const game = await readJsonFile(dir, 'game.json');
  if (!isObject(game) || (typeof game.format === 'number' && game.format >= FORMAT)) return null;
  const files = await readTokenFiles(dir);
  const actors = await readActors(dir);
  const notes: string[] = [];
  const out = new Map<string, unknown>();
  for (const [rel, tokens] of files) {
    const split = splitTokens(tokens, actors);
    out.set(rel, split.tokens);
    for (const [id, actor] of split.actors) {
      actors.set(id, actor);
      out.set(`actors/${id}.json`, actor);
    }
    notes.push(...split.notes.map((n) => `${rel}: ${n}`));
  }
  const backup = await backUp(dir, 'v2', now);
  // Actors before the tokens that name them.
  const order = [...out].sort(([a], [b]) => Number(b.startsWith('actors/')) - Number(a.startsWith('actors/')));
  for (const [rel, data] of order) await writeJson(join(dir, rel), data);
  await writeJson(join(dir, 'game.json'), { ...game, format: FORMAT });
  return { backup, notes };
}
