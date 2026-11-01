import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { dnd5e } from '@vtt/system-dnd5e';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentCompendia, gamePackIssues, packInfos } from './game-packs.ts';
import { PackStore } from './pack-store.ts';

let packs: PackStore;

async function put(dir: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), JSON.stringify(data));
}

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put(dir, 'goblins/pack.json', {
    id: 'goblins',
    name: 'Goblins',
    system: 'dnd5e',
    compendia: [
      { id: 'monsters', type: 'monster', path: 'monsters.json' },
      { id: 'lairs', type: 'scene', path: 'lairs.json' },
    ],
  });
  await put(dir, 'goblins/monsters.json', [{ id: 'goblin-warlord' }]);
  await put(dir, 'goblins/lairs.json', [{ id: 'cave' }]);
  await put(dir, 'forest/pack.json', { id: 'forest', name: 'Forest' });
  await put(dir, 'stars/pack.json', { id: 'stars', name: 'Stars', system: 'starfinder' });
  packs = new PackStore(dir);
  await packs.load();
});

const game = (ids?: string[]) => ({ system: 'dnd5e', ...(ids ? { packs: ids } : {}) });

describe('the packs of a game', () => {
  it('lists the system’s own packs, always on, then the installed ones it may use', () => {
    const infos = packInfos(packs, game(['goblins']), dnd5e);
    expect(infos.map((p) => [p.id, p.enabled, !!p.builtin])).toEqual([
      ['dnd5e-srd-2014', true, true],
      ['dnd5e-srd-2024', true, true],
      ['forest', false, false],
      ['goblins', true, false],
    ]);
  });

  it('reads rules content only from the packs it turned on, and only the system’s content types', () => {
    expect(contentCompendia(packs, game(), dnd5e)).toEqual([]);
    const content = contentCompendia(packs, game(['goblins', 'forest']), dnd5e);
    expect(content.map((c) => `${c.pack}/${c.id}`)).toEqual(['goblins/monsters']);
  });

  it('keeps the same list while nothing changed, so the rules can cache what they build from it', () => {
    expect(contentCompendia(packs, game(['goblins']), dnd5e)).toBe(contentCompendia(packs, game(['goblins']), dnd5e));
  });

  it('warns about packs a game names that the server lacks or that are for another system', () => {
    expect(gamePackIssues(packs, game(['goblins', 'gone', 'stars']), dnd5e)).toEqual([
      expect.stringMatching(/^pack "goblins": monsters #1 \(goblin-warlord\): name /),
      'pack "gone" is not installed on this server (data/packs/gone/)',
      'pack "stars" is for the "starfinder" system',
    ]);
    expect(gamePackIssues(undefined, game(['goblins']), dnd5e)).toEqual([]);
  });
});
