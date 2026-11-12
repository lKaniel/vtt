import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { dnd5e } from '@vtt/system-dnd5e';
import { beforeAll, describe, expect, it } from 'vitest';
import { contentCompendia, findGameAssets, gameArt, gamePackIssues, packInfos } from './game-packs.ts';
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
  await put(dir, 'forest/media/spells/Fireball.webp', 'x');
  const tree = (id: string) => ({
    id,
    src: `media/trees/${id}.webp`,
    kind: 'tile',
    name: id,
    tags: ['trees'],
    w: 20,
    h: 20,
  });
  await put(dir, 'forest/catalog.json', { format: 1, assets: [tree('oak'), tree('pine')] });
  await put(dir, 'icons/pack.json', { id: 'icons', name: 'Icons', art: 'art.json' });
  await put(dir, 'icons/art.json', { spell: { fireball: 'media/fire.webp' }, item: { rope: 'media/rope.webp' } });
  await put(dir, 'icons/media/svg/chest.svg', 'x');
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
      ['icons', false, false],
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

describe('the art of a game’s packs', () => {
  it('puts the packs’ art files and what the system matches by name together, the first pack winning', () => {
    const art = gameArt(packs, game(['forest', 'icons']), dnd5e);
    expect(art.spell).toEqual({ fireball: ['pack://forest/media/spells/Fireball.webp'] });
    expect(art.item).toEqual({ rope: ['pack://icons/media/rope.webp'], chest: ['pack://icons/media/svg/chest.svg'] });
    expect(gameArt(packs, game(['icons', 'forest']), dnd5e).spell).toEqual({
      fireball: ['pack://icons/media/fire.webp'],
    });
  });

  it('has none without packs, and keeps the same art while nothing changed', () => {
    expect(gameArt(packs, game(), dnd5e)).toEqual({});
    expect(gameArt(undefined, game(['icons']), dnd5e)).toEqual({});
    expect(gameArt(packs, game(['icons']), dnd5e)).toBe(gameArt(packs, game(['icons']), dnd5e));
  });
});

describe('a pack on in every game', () => {
  it('is on without game.json naming it, rules content and all', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
    await put(dir, 'house/pack.json', {
      id: 'house',
      name: 'House rules',
      system: 'dnd5e',
      everyGame: true,
      compendia: [{ id: 'classes', type: 'class', path: 'classes.json' }],
    });
    await put(dir, 'house/classes.json', [{ id: 'illusionist' }]);
    const store = new PackStore(dir);
    await store.load();
    expect(packInfos(store, game(), dnd5e).find((p) => p.id === 'house')?.enabled).toBe(true);
    expect(contentCompendia(store, game(), dnd5e).map((c) => `${c.pack}/${c.id}`)).toEqual(['house/classes']);
    expect(contentCompendia(store, game(['house']), dnd5e)).toHaveLength(1);
  });
});

describe('the asset catalogs of a game', () => {
  it('finds map pieces only in the packs the game uses, with how many matched', async () => {
    const asked = [{ search: 'tree' }, { search: 'oak' }];
    const results = await findGameAssets({ packs, campaign: game(['forest']) as never }, asked, 1);
    expect(results.map((r) => [r.total, r.assets.map((a) => a.src)])).toEqual([
      [2, ['pack://forest/media/trees/oak.webp']],
      [1, ['pack://forest/media/trees/oak.webp']],
    ]);
    const off = await findGameAssets({ packs, campaign: game([]) as never }, asked, 1);
    expect(off.map((r) => r.total)).toEqual([0, 0]);
  });
});
