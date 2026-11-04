// Claude building a scene over the bridge (docs/claude-bridge.md) while the
// GM watches: a new scene, rooms with a door and a campfire, three hidden
// goblins, all in the GM's browser at once, and gone again with one undo.

import type { APIRequestContext, Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/fixtures.ts';
import { TRIANGLE } from '../support/models.ts';
import { GM, atTable } from '../support/table.ts';

const KEY = 'e2e-claude';
/** A model in the game's assets for Claude to find and stand on the map. */
async function addModel(dir: string): Promise<void> {
  await writeFile(join(dir, 'assets', 'triangle.gltf'), JSON.stringify(TRIANGLE));
}

test.use({ serverOptions: { mcpKey: KEY, prepare: addModel } });

interface ToolAnswer {
  result?: { content: { type: string; text?: string }[]; isError?: boolean };
}

/** Calls one of the bridge's tools as Claude would; its words back. */
async function tool(request: APIRequestContext, name: string, args: Record<string, unknown>): Promise<string> {
  const res = await request.post('/mcp', {
    headers: { Authorization: `Bearer ${KEY}` },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  const answer = (await res.json()) as ToolAnswer;
  expect(answer.result?.isError, JSON.stringify(answer)).toBeFalsy();
  return answer.result?.content.find((c) => c.type === 'text')?.text ?? '';
}

const goblinsSeen = (page: Page) => page.evaluate(() => vtt.tokens().filter((t) => t.name.startsWith('Goblin')).length);
const wallsOf = (page: Page, scene: string) => page.evaluate((s) => vtt.docs(`${s}/walls`).length, scene);

test('Claude makes a scene, builds a warren in it, and one undo takes the build back', async ({ page, request }) => {
  await atTable(page, GM);
  const made = await tool(request, 'create_scene', {
    name: 'Goblin Warren',
    width: 16,
    height: 10,
    ground: 'dirt',
    show: true,
  });
  expect(JSON.parse(made)).toEqual({ scene: 'goblin-warren' });

  const built = await tool(request, 'build_scene', {
    scene: 'goblin-warren',
    rooms: [
      { name: 'Den', x: 1, y: 1, w: 8, h: 6, floor: 'stone', light: 'campfire', doors: [{ side: 'e', at: 2 }] },
      { name: 'Store', x: 9, y: 1, w: 5, h: 4, floor: 'wood', doors: [{ side: 's', at: 2, kind: 'locked' }] },
    ],
    tokens: [{ monster: 'goblin', x: 4, y: 3, count: 3, hidden: true }],
  });
  expect(built).toContain('creatures 3');
  await expect.poll(() => goblinsSeen(page)).toBe(3);
  await expect.poll(() => wallsOf(page, 'goblin-warren')).toBe(10);
  await page.screenshot({ path: test.info().outputPath('warren.png') });

  await tool(request, 'undo', {});
  await expect.poll(() => goblinsSeen(page)).toBe(0);
  await expect.poll(() => wallsOf(page, 'goblin-warren')).toBe(0);
});

test('Claude finds a 3D model and stands it on the map, seen in the 3D view', async ({ page, request }) => {
  await atTable(page, GM);
  const found = JSON.parse(await tool(request, 'list_assets', { kind: 'model' })) as { assets: { src: string }[] };
  expect(found.assets.map((a) => a.src)).toEqual(['/assets/triangle.gltf']);
  await tool(request, 'build_scene', {
    models: [{ name: 'Ramp', x: 10, y: 8, w: 2, h: 1, src: found.assets[0]!.src, fill: 'tile', piece: 1, height: 5 }],
  });
  await tool(request, 'edit_documents', {
    ops: [{ op: 'update', coll: 'scenes', id: 'crossroads', patch: { view: '3d' } }],
  });
  await expect(page.getByTestId('view3d')).toHaveAttribute('data-models', '2', { timeout: 30_000 });
});
