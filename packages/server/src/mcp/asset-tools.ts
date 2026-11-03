import type { MediaEntry } from '@vtt/core';
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

export function assetTools(table: BridgeTable): McpTool[] {
  return [
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
