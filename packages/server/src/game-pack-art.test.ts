import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type Token, TokenSchema } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Game } from './game.ts';
import { GameStore } from './store/game-store.ts';
import { PackStore } from './library/pack-store.ts';
import { FakeSocket, makeWorld } from './test/fixtures.ts';

// A pack of icons and one of animations, turned on, dress the game: the
// art goes to everyone with the pack content, monsters wear the pack's
// tokens, and a lasting spell's template plays its loop.

let dir: string;
let store: GameStore;
let game: Game;

async function put(root: string, path: string, data: unknown): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof data === 'string' ? data : JSON.stringify(data));
}

async function start(packs: string[]): Promise<void> {
  const packDir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
  await put(packDir, 'icons/pack.json', { id: 'icons', name: 'Icons', art: 'art.json' });
  await put(packDir, 'icons/art.json', { spell: { 'spirit-guardians': 'media/icons/magic/holy/guardians.webp' } });
  await put(packDir, 'icons/media/icons/magic/holy/guardians.webp', 'x');
  await put(packDir, 'icons/media/tokens/humanoid/Goblin.webp', 'x');
  const loop = 'Library/3rd_Level/Spirit_Guardians/SpiritGuardians_01_Light_Yellow_Loop_600x600.webm';
  await put(packDir, 'jb2a/pack.json', { id: 'jb2a', name: 'JB2A' });
  await put(packDir, `jb2a/media/${loop}`, 'x');
  const file = JSON.parse(await readFile(join(dir, 'game.json'), 'utf8')) as object;
  await put(dir, 'game.json', { ...file, packs });
  const installed = new PackStore(packDir);
  await installed.load();
  store = new GameStore(dir, undefined, installed);
  await store.load();
  game = new Game(store, { rng: () => 0.5 });
}

beforeEach(async () => {
  dir = await makeWorld();
});

afterEach(async () => {
  await store.flush();
});

function seat(playerId: string): FakeSocket {
  const ws = new FakeSocket();
  game.connect(ws.asWebSocket, game.findPlayer(playerId)!);
  return ws;
}

const tok = (id: string): Token => store.tokens.get(id)!;

describe('the art of a game’s packs', () => {
  it('goes to everyone with the pack content', async () => {
    await start(['icons', 'jb2a']);
    const [content] = seat('ana').take('packContent');
    expect(content!.art.spell).toEqual({ 'spirit-guardians': ['pack://icons/media/icons/magic/holy/guardians.webp'] });
    expect(content!.art.animation?.['spell:spirit-guardians']).toHaveLength(1);
  });

  it('is nothing without packs', async () => {
    await start([]);
    expect(seat('ana').take('packContent')[0]!.art).toEqual({});
  });

  it('puts a monster in the pack’s token', async () => {
    await start(['icons']);
    store.setToken(TokenSchema.parse({ ...tok('goblin'), monster: 'goblin' }));
    const welcome = seat('gm').take('welcome')[0]!;
    const goblin = welcome.tokens.find((t) => t.id === 'goblin');
    expect(goblin?.art).toBe('pack://icons/media/tokens/humanoid/Goblin.webp');
  });

  it('plays the spell’s loop on a lasting zone’s template', async () => {
    await start(['jb2a']);
    store.setToken(
      TokenSchema.parse({
        ...tok('hero'),
        stats: { class: 'cleric', level: 5, maxHp: 30, abilities: { wis: 16 }, spells: ['spirit-guardians'] },
      }),
    );
    const ana = seat('ana');
    ana.receive({ t: 'cast', caster: 'hero', spell: 'spirit-guardians', slot: 3, targets: [] });
    const [template] = store.docs.all('main/templates');
    expect(template?.texture).toContain('SpiritGuardians_01_Light_Yellow_Loop');
  });
});
