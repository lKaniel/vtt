import { join } from 'node:path';
import { DEFAULT_SYSTEM } from '@vtt/shared';
import { z } from 'zod';
import type { ActorSystem } from './foundry-actors.ts';
import { type FoundryDoc, readFoundryDb } from './foundry-db.ts';
import { readJson } from '../store/json-files.ts';
import { SYSTEMS } from '../systems.ts';

// Reading a Foundry world folder: its manifest, every database we read,
// its settings, and the game system that reads its actors.

const WorldSchema = z.object({
  /** `id` since v10, `name` before. */
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  system: z.string().optional(),
});

const COLLECTIONS = [
  'scenes',
  'actors',
  'items',
  'journal',
  'tables',
  'playlists',
  'folders',
  'settings',
  'users',
  'macros',
  'cards',
] as const;
type Docs = Record<(typeof COLLECTIONS)[number], FoundryDoc[]>;

export interface World {
  dir: string;
  id: string;
  title: string;
  /** The Foundry system it is for, e.g. "dnd5e". */
  system: string;
  docs: Docs;
}

async function readManifest(dir: string) {
  const raw = await readJson(join(dir, 'world.json'));
  if (raw === undefined) throw new Error(`${dir} has no world.json: pick a world's folder in Foundry's Data/worlds/.`);
  const m = WorldSchema.parse(raw);
  const id = m.id ?? m.name ?? 'world';
  return { ...m, id, title: m.title ?? id };
}

/** A Foundry world's title, to name the game after. */
export const foundryWorldTitle = async (dir: string): Promise<string> => (await readManifest(dir)).title;

/** The world's manifest and every database we read. */
export async function readWorld(dir: string): Promise<World> {
  const m = await readManifest(dir);
  const docs = {} as Docs;
  for (const c of COLLECTIONS) docs[c] = await readFoundryDb(join(dir, 'data', c));
  return { dir, id: m.id, title: m.title, system: m.system ?? '', docs };
}

/** A world setting by key (Foundry keeps each value as JSON text). */
export function settingsOf(settings: FoundryDoc[]) {
  return (key: string): unknown => {
    const value = settings.find((s) => s.key === key)?.value;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  };
}

/** The system that reads this world's actors, else the server's default (bare actors). */
export function systemFor(world: World): ActorSystem {
  const all = [...SYSTEMS.infos()].map((s) => SYSTEMS.get(s.id)!);
  return all.find((s) => s.foundry?.system === world.system) ?? SYSTEMS.require(DEFAULT_SYSTEM);
}
