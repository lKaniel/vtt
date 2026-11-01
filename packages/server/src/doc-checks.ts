import { type Doc, OpError, type Validate } from '@vtt/core';
import { ActorSchema, CombatSchema } from '@vtt/system-dnd5e';
import { ClockSchema, type Game, GameSchema, isGm, type Scene, SceneSchema } from '@vtt/shared';
import type { z } from 'zod';
import { fromDoc, toDoc } from './doc-sync.ts';
import { ITEM_SCHEMAS } from './game-files.ts';
import { ACTORS, CLOCK, COMBAT, GAME, SCENES, TYPE } from './store-colls.ts';
import { ENTRY_COLLS } from './entry-files.ts';

// Documents sent by a client in an `ops` message are checked against the
// same schemas as the files they are saved in, so an edit can't write a
// file the server would refuse to load.

interface Rule {
  type: string;
  schema: z.ZodType;
  /** Singletons (a scene's settings, the fight) don't keep their id in the file. */
  bare?: boolean;
  extra?: (data: never) => void;
}

const NAMED: Record<string, Rule> = {
  [GAME]: { type: 'game', schema: GameSchema, extra: keepsGm },
  [SCENES]: { type: 'scene', schema: SceneSchema, bare: true, extra: wholeChunks },
  [ACTORS]: { type: 'actor', schema: ActorSchema },
  [COMBAT]: { type: 'combat', schema: CombatSchema, bare: true },
  [CLOCK]: { type: 'clock', schema: ClockSchema, bare: true },
  ...Object.fromEntries(Object.entries(ENTRY_COLLS).map(([coll, rule]) => [coll, { ...rule }])),
};

/** As game-files.ts checks scene.json. */
function wholeChunks(scene: Scene): void {
  if (scene.chunkSize % scene.gridSize !== 0) throw new OpError('chunkSize must be a multiple of gridSize');
}

function keepsGm(game: Game): void {
  if (!game.players.some(isGm)) throw new OpError('The table needs a GM');
}

const article = (type: string) => (/^[aeiou]/.test(type) ? `an ${type}` : `a ${type}`);

/** The rule for a collection, or an error for one that doesn't exist. */
function ruleFor(coll: string, hasScene: (id: string) => boolean): Rule {
  const named = NAMED[coll];
  if (named) return named;
  const [scene, name, ...rest] = coll.split('/');
  if (!scene || !name || rest.length || !(name in ITEM_SCHEMAS)) throw new OpError(`${coll} is not a collection`);
  if (!hasScene(scene)) throw new OpError(`there is no scene "${scene}"`);
  const key = name as keyof typeof ITEM_SCHEMAS;
  return { type: TYPE[key], schema: ITEM_SCHEMAS[key] };
}

/** The document as its file would hold it, or an OpError a GM can read. */
function checked(rule: Rule, coll: string, doc: Doc): Doc {
  if (doc.type !== rule.type) {
    throw new OpError(`${doc.id}: a document in ${coll} is ${article(rule.type)}, not ${article(doc.type)}`);
  }
  const parsed = rule.schema.safeParse(fromDoc(doc, !rule.bare));
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new OpError(`${doc.id}: ${[...issue.path, issue.message].join(': ')}`);
  }
  rule.extra?.(parsed.data as never);
  return { ...toDoc(rule.type, parsed.data as object, rule.bare ? doc.id : undefined), rev: doc.rev };
}

/** Checks documents from a client; `hasScene` says which scenes exist. */
export function clientCheck(hasScene: (id: string) => boolean): Validate {
  return (coll, doc) => checked(ruleFor(coll, hasScene), coll, doc);
}
