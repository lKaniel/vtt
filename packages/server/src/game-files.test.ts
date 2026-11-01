import { describe, expect, it } from 'vitest';
import { ActorSchema, GameSchema, SceneSchema, TokenSchema, type Token, type TokenEntry } from '@vtt/shared';
import { classify, crossCheck, parseFile, type GameState } from './game-files.ts';

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
    expect(classify('scenes/crossroads/notes.json')).toBeNull();
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
});
