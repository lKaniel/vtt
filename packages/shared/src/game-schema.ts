import { z } from 'zod';
import { PlayerSchema, SceneSettingsSchema, type World } from './schema.ts';
import { EditionSchema } from './stats-schema.ts';

// A game folder (storage v2): game.json holds the campaign and its seats,
// scenes/<id>/scene.json each map's settings. In memory the game combines
// them into the `World` table settings that the rules and the client use.

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes');

/** game.json */
export const GameSchema = z.object({
  id,
  /** Folder format: 3 = actors split from tokens. Older folders are moved up when the server starts. */
  format: z.number().int().positive().optional(),
  name: z.string().min(1),
  /** Rules edition: "2014" (SRD 5.1) or "2024" (SRD 5.2). Characters can override it. */
  rules: EditionSchema.default('2014'),
  /** The scene everyone is on: a folder in scenes/. */
  scene: id,
  players: z.array(PlayerSchema).min(1),
});
export type Game = z.infer<typeof GameSchema>;

/** scenes/<id>/scene.json */
export const SceneSchema = SceneSettingsSchema.extend({ name: z.string().min(1).optional() });
export type Scene = z.infer<typeof SceneSchema>;

/** The table settings for `scene` of `game`. */
export function worldOf(game: Game, scene: Scene): World {
  const { gridSize, chunkSize, start, darkness, vision } = scene;
  return { name: game.name, rules: game.rules, players: game.players, gridSize, chunkSize, start, darkness, vision };
}

/** Puts changed table settings back where they are stored. */
export function splitWorld(world: World, game: Game, scene: Scene): { game: Game; scene: Scene } {
  const { name, rules, players, gridSize, chunkSize, start, darkness, vision } = world;
  return {
    game: { ...game, name, rules, players },
    scene: { ...scene, gridSize, chunkSize, start, darkness, vision },
  };
}
