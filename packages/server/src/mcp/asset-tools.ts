import { AssetQuerySchema, type MediaEntry, type PackAsset } from '@vtt/core';
import { z } from 'zod';
import type { McpTool } from './mcp-protocol.ts';
import { ask } from './mcp-seat.ts';
import type { BridgeTable } from './mcp-tools.ts';

// The pictures, sounds, videos and 3D models a game may use (its own
// assets and its packs'), as the GM's asset browser lists them, for Claude
// to pick a tile picture, an ambient sound or a model for the 3D view.

const ListSchema = z.object({
  game: z.string().optional().describe('The game id (from list_games); leave out for your default game.'),
  kind: z.enum(['image', 'audio', 'video', 'model']).optional(),
  search: z.string().max(80).optional().describe('Words to find in the name, folders or pack'),
  limit: z.number().int().min(1).max(500).default(100),
});
type List = z.infer<typeof ListSchema>;

function matches(e: MediaEntry, a: List): boolean {
  if (a.kind && e.kind !== a.kind) return false;
  if (!a.search) return true;
  const text = [e.name, e.pack ?? '', ...e.tags].join(' ').toLowerCase();
  return a.search
    .toLowerCase()
    .split(/\s+/)
    .every((w) => text.includes(w));
}

const FindSchema = z.object({
  game: ListSchema.shape.game,
  ...AssetQuerySchema.shape,
  search: z
    .string()
    .max(200)
    .optional()
    .describe('Words that must all match ("oak tree", "cobblestone", "wagon"), or an id'),
  limit: z.number().int().min(1).max(200).default(30),
});
type Find = z.infer<typeof FindSchema>;

/** An asset as Claude needs it to place it: what it is and how big. */
const brief = (a: PackAsset) => ({
  id: a.id,
  name: a.name,
  kind: a.kind,
  w: a.w,
  h: a.h,
  ...(a.height !== undefined && { height: a.height }),
  ...(a.overhead && { overhead: true }),
  src: a.src,
  ...(a.thumb && { thumb: a.thumb }),
  tags: a.tags.slice(0, 12),
});

function findAssetsTool(table: BridgeTable): McpTool {
  return {
    name: 'find_assets',
    description:
      'Map pieces in the asset catalogs of the game’s packs (GM), best first: tiles (2D pictures seen from ' +
      'above: trees, rocks, wagons, buildings), textures (tileable ground and floors) and models (3D). Sizes ' +
      'are feet (w across, h down, height). Use their ids, or the same words, in build_scene props, scatter ' +
      'and grounds. Search with plain words: "pine tree", "boulder", "market stall", "cobblestone", "cave".',
    input: FindSchema,
    run: async (a: Find) => {
      const { game, player } = await table.seat(a.game);
      const { limit, game: _, ...query } = a;
      const answer = await ask(game, player, { t: 'findAssets', queries: [query], limit }, 'assets');
      const found = answer.results[0] ?? { total: 0, assets: [] };
      if (!found.total) return JSON.stringify({ total: 0, note: 'Nothing: try fewer or other words, or another kind' });
      return JSON.stringify({ total: found.total, assets: found.assets.map(brief) });
    },
  };
}

const UploadSchema = z.object({
  game: ListSchema.shape.game,
  name: z.string().min(1).max(200).describe('The file name with its extension ("wheat-field.webp")'),
  data: z.string().min(1).describe('The file, base64'),
});

function uploadTool(table: BridgeTable): McpTool {
  return {
    name: 'upload_asset',
    description:
      'Puts a picture, sound or video of your own into the game’s uploads (GM; a player: a picture), as the ' +
      'asset browser’s upload does. Answers its src (/assets/uploads/<name>) for tiles, patterns and tokens.',
    input: UploadSchema,
    run: async (a: z.infer<typeof UploadSchema>) => {
      const { game, player } = await table.seat(a.game);
      const media = await ask(game, player, { t: 'upload', name: a.name, data: a.data }, 'media');
      return JSON.stringify({ src: media.uploaded?.src });
    },
  };
}

export function assetTools(table: BridgeTable): McpTool[] {
  return [
    findAssetsTool(table),
    uploadTool(table),
    {
      name: 'list_assets',
      description:
        'The media the game may use (GM): pictures for tiles, sounds, videos, and 3D models (.glb/.gltf) for ' +
        'build_scene models. Each has the src to store.',
      input: ListSchema,
      run: async (a: List) => {
        const { game, player } = await table.seat(a.game);
        const media = await ask(game, player, { t: 'media' }, 'media');
        const found = media.entries.filter((e) => matches(e, a));
        const assets = found.slice(0, a.limit).map((e) => ({ src: e.src, name: e.name, kind: e.kind, tags: e.tags }));
        return JSON.stringify({ total: found.length, assets });
      },
    },
  ];
}
