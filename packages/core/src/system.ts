import type { z } from 'zod';

// A game system: the rules, content and creature sheets a game runs on
// (D&D 5e lives in packages/system-dnd5e). The engine (scenes, walls, fog,
// the editor, the lobby) reaches a system only through this interface, so
// it never needs to know what a hit point is. A system package exports one
// SystemDefinition; the server registers the ones it has in a
// SystemRegistry and each game names the one it plays (game.json `system`).

/** A rules edition (or variant) a system can play, e.g. D&D's 2014 and 2024 rules. */
export interface RulesEdition {
  id: string;
  name: string;
}

/** What the lobby shows of a system. */
export interface SystemInfo {
  id: string;
  name: string;
  /** The rules editions it can play, the first being the default. */
  editions: readonly RulesEdition[];
}

export interface SystemDefinition<TToken = unknown, TActor = unknown> extends SystemInfo {
  /** A token in a scene's tokens.json: placement plus the system's creature data. */
  tokenSchema: z.ZodType<TToken>;
  /** A creature sheet in actors/<id>.json. */
  actorSchema: z.ZodType<TActor>;
  /** What a token or actor refers to that the edition's content doesn't have (an unknown monster or spell). */
  tokenIssues: (sheet: TToken | TActor, edition: string) => string[];
}

/** The edition a system plays when a game doesn't say. */
export function defaultEdition(system: SystemInfo): string {
  const first = system.editions[0];
  if (!first) throw new Error(`System "${system.id}" has no rules editions.`);
  return first.id;
}

/** `edition` if the system has it, else its default. */
export function editionIn(system: SystemInfo, edition: string | undefined): string {
  return system.editions.some((e) => e.id === edition) ? edition! : defaultEdition(system);
}

/** The systems a server can run games on, by id. */
export class SystemRegistry<S extends SystemInfo = SystemDefinition> {
  private byId = new Map<string, S>();

  constructor(systems: readonly S[]) {
    for (const s of systems) {
      if (this.byId.has(s.id)) throw new Error(`Two systems are called "${s.id}".`);
      this.byId.set(s.id, s);
    }
  }

  get(id: string): S | undefined {
    return this.byId.get(id);
  }

  /** The system a game plays, or an error naming the one this server lacks. */
  require(id: string): S {
    const system = this.byId.get(id);
    if (!system) throw new Error(`This server has no "${id}" system.`);
    return system;
  }

  /** What the lobby lists: names and editions, no rules. */
  infos(): SystemInfo[] {
    return [...this.byId.values()].map(({ id, name, editions }) => ({ id, name, editions }));
  }
}
