import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ActorSchema, dnd5e, type Token, type TokenEntry, TokenSchema } from '@vtt/system-dnd5e';
import { GameSchema, SceneSchema, TileSchema } from '@vtt/shared';
import { classify, crossCheck, parseFile, type GameState } from './game-files.ts';
import { PackStore } from './pack-store.ts';

describe('classify', () => {
  it('recognises game files and ignores the rest', () => {
    expect(classify('game.json')).toEqual({ kind: 'game' });
    expect(classify('combat.json')).toEqual({ kind: 'combat' });
    expect(classify('actors/bandit.json')).toEqual({ kind: 'actor', id: 'bandit' });
    expect(classify('scenes/crossroads/scene.json')).toEqual({ kind: 'scene', scene: 'crossroads' });
    expect(classify('scenes/crossroads/walls.json')).toEqual({
      kind: 'collection',
      scene: 'crossroads',
      coll: 'walls',
    });
    expect(classify('scenes/crossroads/tokens.json')).toMatchObject({ coll: 'tokens' });
    expect(classify('scenes/crossroads/notes.json')).toEqual({
      kind: 'collection',
      scene: 'crossroads',
      coll: 'notes',
    });
    expect(classify('scenes/crossroads/scribbles.json')).toBeNull();
    expect(classify('journals/the-inn.json')).toEqual({ kind: 'entry', coll: 'journals', id: 'the-inn' });
    expect(classify('tables/loot.json')).toEqual({ kind: 'entry', coll: 'tables', id: 'loot' });
    expect(classify('playlists/tavern.json')).toEqual({ kind: 'entry', coll: 'playlists', id: 'tavern' });
    expect(classify('scenes/crossroads/walls.json.123.tmp')).toBeNull();
    expect(classify('.v1-backup/2026/world.json')).toBeNull();
    expect(classify('assets/map.png')).toBeNull();
    expect(classify('world.json')).toBeNull();
  });
});

describe('parseFile', () => {
  it('fills defaults in every item of a collection', () => {
    const r = parseFile({ kind: 'collection', scene: 'main', coll: 'walls' }, '[{"id":"w","a":[0,0],"b":[1,0]}]');
    expect(r.errors).toEqual([]);
    expect(r.file?.kind === 'collection' && r.file.data[0]).toEqual({ id: 'w', a: [0, 0], b: [1, 0] });
    const lights = parseFile(
      { kind: 'collection', scene: 'main', coll: 'lights' },
      '[{"id":"l","x":0,"y":0,"bright":5}]',
    );
    expect(lights.file?.kind === 'collection' && lights.file.data[0]).toMatchObject({ dim: 0 });
  });

  it('keeps tokens as written: their sheet comes from the actor', () => {
    const text = '[{"id":"g","x":50,"y":50,"actor":"goblin","delta":{"hp":3,"tempHp":null}}]';
    const r = parseFile({ kind: 'collection', scene: 'main', coll: 'tokens' }, text);
    expect(r.errors).toEqual([]);
    expect(r.file?.kind === 'collection' && r.file.data[0]).toEqual((JSON.parse(text) as unknown[])[0]);
  });

  it('explains what is wrong, naming the item', () => {
    const walls = { kind: 'collection', scene: 'main', coll: 'walls' } as const;
    expect(parseFile(walls, '{}').errors[0]).toMatch(/a list/);
    expect(parseFile(walls, '[{"id":"w1","a":[0,0]}]').errors).toEqual([
      'wall "w1": b: Invalid input: expected tuple, received undefined',
    ]);
    expect(parseFile(walls, '[{"id":"w","a":[0,0],"b":[1,0]},{"id":"w","a":[0,0],"b":[0,1]}]').errors).toEqual([
      'duplicate id "w" in this scene',
    ]);
    expect(parseFile({ kind: 'game' }, '{ broken').errors[0]).toMatch(/invalid JSON/);
    expect(
      parseFile({ kind: 'game' }, '{"id":"g","name":"x","scene":"s","players":[{"id":"a","name":"A","role":"player"}]}')
        .errors,
    ).toContain('at least one player needs role "gm"');
    expect(parseFile({ kind: 'scene', scene: 's' }, '{"gridSize":140}').errors).toEqual([
      'chunkSize must be a multiple of gridSize',
    ]);
  });

  it('parses an actor and checks its file name', () => {
    const ok = parseFile({ kind: 'actor', id: 'bandit' }, '{"id":"bandit","name":"Bandit","folder":"Road"}');
    expect(ok.file).toMatchObject({ kind: 'actor', id: 'bandit', data: { folder: 'Road', speed: 30 } });
    expect(parseFile({ kind: 'actor', id: 'bandit' }, '{"id":"bob","name":"Bob"}').errors[0]).toMatch(/file name/);
  });
});

function state(tokens: (Token | TokenEntry)[], extra: Partial<GameState> = {}): GameState {
  const game = GameSchema.parse({ id: 'g', name: 'G', scene: 'main', players: [{ id: 'gm', name: 'GM', role: 'gm' }] });
  const scene = { scene: SceneSchema.parse({}), tiles: [], walls: [], lights: [], tokens };
  return { game, scenes: new Map([['main', scene]]), actors: new Map(), ...extra };
}

describe('crossCheck', () => {
  it("asks the game's system what a token refers to that its content lacks", () => {
    const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, monster: 'goblin' });
    const strict = { ...dnd5e, tokenIssues: () => ['no such creature'] };
    expect(crossCheck(state([token]), strict)).toEqual([
      { file: 'scenes/main/tokens.json', message: 'token "w": no such creature' },
    ]);
    expect(crossCheck({ ...state([token]), game: { ...state([]).game, system: 'gurps' } })).toEqual([
      { file: 'game.json', message: 'this server has no "gurps" system' },
    ]);
  });

  it('lets tokens refer to the monsters of the packs the game uses, and warns about packs it lacks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vtt-packs-'));
    await mkdir(join(dir, 'goblins'));
    const manifest = { id: 'goblins', name: 'Goblins', compendia: [{ id: 'm', type: 'monster', path: 'm.json' }] };
    await writeFile(join(dir, 'goblins', 'pack.json'), JSON.stringify(manifest));
    const warlord = { id: 'goblin-warlord', name: 'Warlord', ac: 17, hp: 45, cr: 3 };
    const abilities = { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 14 };
    await writeFile(join(dir, 'goblins', 'm.json'), JSON.stringify([{ ...warlord, abilities }]));
    const packs = new PackStore(dir);
    await packs.load();
    const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, monster: 'goblin-warlord' });
    const game = { ...state([]).game, packs: ['goblins', 'gone'] };
    expect(crossCheck({ ...state([token]), game }, dnd5e, packs)).toEqual([
      { file: 'game.json', message: 'pack "gone" is not installed on this server (data/packs/gone/)', warning: true },
    ]);
    expect(crossCheck({ ...state([token]), game }, dnd5e).map((i) => i.message)).toEqual([
      'token "w": unknown monster "goblin-warlord" in the 2014 rules',
    ]);
  });

  it('reports observers who are not at the table', () => {
    const token = TokenSchema.parse({
      id: 'w',
      name: 'W',
      x: 0,
      y: 0,
      ownership: { default: 'limited', ghost: 'observer' },
    });
    expect(crossCheck(state([token]))).toEqual([
      { file: 'scenes/main/tokens.json', message: 'token "w": unknown player "ghost"' },
    ]);
  });

  it('reports tiles in a missing or unfit parent, and loops', () => {
    const rect = (id: string, extra: object = {}) =>
      TileSchema.parse({ id, kind: 'rect', color: '#000', x: 0, y: 0, w: 1, h: 1, ...extra });
    const tiles = [
      rect('ground', { background: true }),
      rect('lost', { parent: 'nowhere' }),
      rect('weed', { parent: 'ground' }),
      TileSchema.parse({ id: 'a', kind: 'group', parent: 'b' }),
      TileSchema.parse({ id: 'b', kind: 'group', parent: 'a' }),
      TileSchema.parse({ id: 'empty', kind: 'group' }),
    ];
    const scene = { scene: SceneSchema.parse({}), tiles, walls: [], lights: [], tokens: [] };
    expect(crossCheck({ ...state([]), scenes: new Map([['main', scene]]) })).toEqual([
      { file: 'scenes/main/tiles.json', message: 'tile "lost": parent "nowhere" is not a tile here' },
      { file: 'scenes/main/tiles.json', message: 'tile "weed": "ground" is ground and can\'t hold tiles' },
      { file: 'scenes/main/tiles.json', message: 'tile "a" is inside itself' },
      { file: 'scenes/main/tiles.json', message: 'tile "b" is inside itself' },
      { file: 'scenes/main/tiles.json', message: 'group "empty" holds no tiles', warning: true },
    ]);
  });

  it('reports spells the edition does not have', () => {
    const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, stats: { spells: ['fireball', 'chaos-bolt'] } });
    expect(crossCheck(state([token])).map((i) => i.message)).toEqual([
      'token "w": unknown spell "chaos-bolt" in the 2014 rules',
    ]);
  });

  it('reports unknown monsters, items and combatants', () => {
    const token = TokenSchema.parse({
      id: 'orc',
      name: 'Orc',
      x: 0,
      y: 0,
      monster: 'orc-warlord',
      inventory: [{ item: 'greataxe' }, { item: 'lightsaber' }],
    });
    const combat = {
      round: 1,
      turn: 0,
      order: [{ token: 'ghost', initiative: 3 }],
      left: { move: 30, action: true, bonus: true, attacks: 0, used: [] },
      side: {},
      reacted: [],
    };
    expect(crossCheck(state([token], { combat })).map((i) => i.message)).toEqual([
      'token "orc": unknown monster "orc-warlord" in the 2014 rules',
      'token "orc": unknown item "lightsaber"',
      'unknown token "ghost" in the initiative order',
    ]);
  });

  it('flags unknown monsters in actors and a missing active scene', () => {
    const actor = ActorSchema.parse({ id: 'odd', name: 'Odd', monster: 'nothing-like-it' });
    const s = state([], { actors: new Map([['odd', actor]]) });
    s.game = { ...s.game, scene: 'cellar' };
    expect(crossCheck(s)).toEqual([
      { file: 'game.json', message: 'scene "cellar" has no folder in scenes/' },
      { file: 'actors/odd.json', message: 'unknown monster "nothing-like-it" in the 2014 rules' },
    ]);
  });

  it('reports tokens whose actor is missing or whose delta breaks them, once per problem', () => {
    const odd = ActorSchema.parse({ id: 'odd', name: 'Odd', monster: 'nothing-like-it' });
    const tokens: TokenEntry[] = [
      { id: 'a', x: 0, y: 0, actor: 'nobody' },
      { id: 'b', x: 0, y: 0, actor: 'odd', delta: { name: null } },
      { id: 'c', x: 0, y: 0, actor: 'odd', delta: { ownership: { default: 'limited', ghost: 'observer' } } },
    ];
    expect(
      crossCheck(state(tokens, { actors: new Map([['odd', odd]]) })).map((i) => `${i.file}: ${i.message}`),
    ).toEqual([
      'scenes/main/tokens.json: token "a": unknown actor "nobody"',
      'scenes/main/tokens.json: token "b": name: Invalid input: expected string, received undefined',
      'scenes/main/tokens.json: token "c": unknown player "ghost"',
      'actors/odd.json: unknown monster "nothing-like-it" in the 2014 rules',
    ]);
  });

  it('reports notes on missing journal entries, teleports to missing scenes and unknown levels', () => {
    const scene = {
      scene: SceneSchema.parse({ levels: [{ id: 'ground', name: 'Ground', bottom: 0 }] }),
      tiles: [],
      walls: [{ id: 'w', a: [0, 0], b: [1, 0], level: 'attic' }],
      lights: [],
      tokens: [],
      notes: [
        { id: 'pin', x: 0, y: 0, entry: 'lost-diary' },
        { id: 'inn', x: 0, y: 0, entry: 'the-inn' },
      ],
      regions: [
        {
          id: 'portal',
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          behaviors: [{ type: 'teleport', to: [0, 0], scene: 'mars' }],
        },
        {
          id: 'stairs',
          points: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
          behaviors: [{ type: 'level', to: 'roof' }],
        },
      ],
    } as GameState['scenes'] extends Map<string, infer S> ? S : never;
    const journals = new Map([['the-inn', { id: 'the-inn', name: 'The inn', pages: [] }]]);
    expect(crossCheck({ ...state([]), scenes: new Map([['main', scene]]), journals })).toEqual([
      { file: 'scenes/main/walls.json', message: 'wall "w": unknown level "attic"' },
      { file: 'scenes/main/notes.json', message: 'note "pin": unknown journal entry "lost-diary"' },
      { file: 'scenes/main/regions.json', message: 'region "portal": unknown scene "mars"' },
      { file: 'scenes/main/regions.json', message: 'region "stairs": unknown level "roof"' },
    ]);
  });
});
