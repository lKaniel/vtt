import { describe, expect, it } from 'vitest';
import { ActorSchema, TokenSchema, WorldSchema } from '@vtt/shared';
import { classify, crossCheck, parseFile } from './files.ts';

describe('classify', () => {
  it('recognises world files and ignores the rest', () => {
    expect(classify('world.json')).toEqual({ kind: 'world' });
    expect(classify('chunks/-1_0.json')).toEqual({ kind: 'chunk', key: '-1_0' });
    expect(classify('tokens/bram.json')).toEqual({ kind: 'token', id: 'bram' });
    expect(classify('combat.json')).toEqual({ kind: 'combat' });
    expect(classify('actors/bandit.json')).toEqual({ kind: 'actor', id: 'bandit' });
    expect(classify('tokens/bram.json.123.tmp')).toBeNull();
    expect(classify('assets/map.png')).toBeNull();
  });
});

describe('parseFile', () => {
  it('fills token defaults', () => {
    const r = parseFile({ kind: 'token', id: 'bram' }, '{"id":"bram","name":"Bram","x":50,"y":50}');
    expect(r.errors).toEqual([]);
    expect(r.file?.kind === 'token' && r.file.data.speed).toBe(30);
  });

  it('explains what is wrong', () => {
    expect(parseFile({ kind: 'token', id: 'bram' }, '{"id":"bob","name":"Bob","x":0,"y":0}').errors[0]).toMatch(
      /match the file name/,
    );
    expect(parseFile({ kind: 'chunk', key: 'nope' }, '{}').errors[0]).toMatch(/<cx>_<cy>/);
    expect(parseFile({ kind: 'world' }, '{ broken').errors[0]).toMatch(/invalid JSON/);
    expect(
      parseFile({ kind: 'world' }, '{"name":"x","players":[{"id":"a","name":"A","role":"player"}]}').errors,
    ).toContain('at least one player needs role "gm"');
  });
});

describe('crossCheck', () => {
  it('reports observers who are not at the table', () => {
    const world = WorldSchema.parse({ name: 'w', players: [{ id: 'gm', name: 'GM', role: 'gm' }] });
    const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, observers: ['ghost'] });
    expect(crossCheck(world, new Map(), new Map([['w', token]])).map((i) => i.message)).toEqual([
      'unknown player "ghost"',
    ]);
  });

  it('reports spells the edition does not have', () => {
    const world = WorldSchema.parse({ name: 'w', players: [{ id: 'gm', name: 'GM', role: 'gm' }] });
    const token = TokenSchema.parse({ id: 'w', name: 'W', x: 0, y: 0, stats: { spells: ['fireball', 'chaos-bolt'] } });
    expect(crossCheck(world, new Map(), new Map([['w', token]])).map((i) => i.message)).toEqual([
      'unknown spell "chaos-bolt" in the 2014 rules',
    ]);
  });

  it('reports unknown monsters, items and combatants', () => {
    const world = WorldSchema.parse({ name: 'w', players: [{ id: 'gm', name: 'GM', role: 'gm' }] });
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
    const issues = crossCheck(world, new Map(), new Map([['orc', token]]), { combat });
    expect(issues.map((i) => i.message)).toEqual([
      'unknown monster "orc-warlord" in the 2014 rules',
      'unknown item "lightsaber"',
      'unknown token "ghost" in the initiative order',
    ]);
  });
});

describe('actor files', () => {
  it('parses an actor and checks its file name', () => {
    const ok = parseFile({ kind: 'actor', id: 'bandit' }, '{"id":"bandit","name":"Bandit","folder":"Road"}');
    expect(ok.file).toMatchObject({ kind: 'actor', id: 'bandit', data: { folder: 'Road', speed: 30 } });
    expect(parseFile({ kind: 'actor', id: 'bandit' }, '{"id":"bob","name":"Bob"}').errors[0]).toMatch(/file name/);
  });

  it('flags unknown monsters in actors', () => {
    const world = WorldSchema.parse({ name: 'w', players: [{ id: 'gm', name: 'GM', role: 'gm' }] });
    const actor = ActorSchema.parse({ id: 'odd', name: 'Odd', monster: 'nothing-like-it' });
    const issues = crossCheck(world, new Map(), new Map(), { actors: new Map([['odd', actor]]) });
    expect(issues).toEqual([
      { file: 'actors/odd.json', message: 'unknown monster "nothing-like-it" in the 2014 rules' },
    ]);
  });
});
