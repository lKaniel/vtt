import { describe, expect, it } from 'vitest';
import { classify, parseFile } from './files.ts';

describe('classify', () => {
  it('recognises world files and ignores the rest', () => {
    expect(classify('world.json')).toEqual({ kind: 'world' });
    expect(classify('chunks/-1_0.json')).toEqual({ kind: 'chunk', key: '-1_0' });
    expect(classify('tokens/bram.json')).toEqual({ kind: 'token', id: 'bram' });
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
    expect(parseFile({ kind: 'token', id: 'bram' }, '{"id":"bob","name":"Bob","x":0,"y":0}').errors[0]).toMatch(/match the file name/);
    expect(parseFile({ kind: 'chunk', key: 'nope' }, '{}').errors[0]).toMatch(/<cx>_<cy>/);
    expect(parseFile({ kind: 'world' }, '{ broken').errors[0]).toMatch(/invalid JSON/);
    expect(
      parseFile({ kind: 'world' }, '{"name":"x","players":[{"id":"a","name":"A","role":"player"}]}').errors,
    ).toContain('at least one player needs role "gm"');
  });
});
