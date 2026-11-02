import type { Doc } from '@vtt/core';
import { describe, expect, it } from 'vitest';
import { commonValue, fieldsFor, MIXED } from './inspector.ts';

const wall = (extra: Record<string, unknown> = {}): Doc => ({
  id: 'w',
  type: 'wall',
  rev: 1,
  a: [0, 0],
  b: [1, 0],
  ...extra,
});
const light: Doc = { id: 'l', type: 'light', rev: 1, x: 0, y: 0, bright: 20, dim: 20 };

const field = (docs: Doc[], key: string) => fieldsFor(docs).find((f) => f.key === key)!;

describe('the inspector', () => {
  it('shows the fields of the selection, or none for a mixed bag of types', () => {
    expect(fieldsFor([light]).map((f) => f.key)).toEqual([
      'bright',
      'dim',
      'color',
      'colorIntensity',
      'luminosity',
      'attenuation',
      'angle',
      'animation',
      'darkness',
      'walls',
      'tile',
    ]);
    expect(fieldsFor([light, wall()])).toEqual([]);
    expect(fieldsFor([])).toEqual([]);
  });

  it('shows a value all of them share, or "mixed"', () => {
    const bright = field([light, light], 'bright');
    expect(commonValue([light, light], bright)).toBe(20);
    expect(commonValue([light, { ...light, bright: 10 }], bright)).toBe(MIXED);
  });

  it('turns a wall into a door, window or terrain wall, and back', () => {
    const kind = field([wall()], 'kind');
    const reset = {
      door: null,
      secret: null,
      doorSound: null,
      move: null,
      sight: null,
      light: null,
      sound: null,
      threshold: null,
    };
    expect(commonValue([wall(), wall({ door: 'open' })], kind)).toBe(MIXED);
    expect(commonValue([wall({ sight: 'none', light: 'none' })], kind)).toBe('window');
    expect(commonValue([wall({ sight: 'proximity' })], kind)).toBe('custom');
    expect(kind.patch('door')).toEqual({ ...reset, door: 'closed' });
    expect(kind.patch('window')).toEqual({ ...reset, sight: 'none', light: 'none' });
    expect(kind.patch('terrain')).toEqual({ ...reset, sight: 'limited', light: 'limited', sound: 'limited' });
    expect(kind.patch('wall')).toEqual(reset);
  });

  it('sets what a wall stops one by one, normal being the default', () => {
    const sight = field([wall()], 'sight');
    expect(commonValue([wall()], sight)).toBe('normal');
    expect(sight.patch('limited')).toEqual({ sight: 'limited' });
    expect(sight.patch('normal')).toEqual({ sight: null });
    expect(field([wall()], 'move').options!.map((o) => o.value)).toEqual(['none', 'normal']);
  });

  it('asks how close a proximity wall lets a sense through, only for proximity walls', () => {
    const near = wall({ light: 'proximity', threshold: { sight: 5 } });
    const keys = fieldsFor([near]).map((f) => f.key);
    expect(keys).toContain('threshold.light');
    expect(keys).not.toContain('threshold.sight');
    const reach = field([near], 'threshold.light');
    expect(reach.patch(15, near)).toEqual({ threshold: { sight: 5, light: 15 } });
  });

  it('offers the door state, secrecy and sound only when every wall is a door', () => {
    expect(fieldsFor([wall()]).map((f) => f.key)).toEqual([
      'kind',
      'move',
      'sight',
      'light',
      'sound',
      'dir',
      'height.bottom',
      'height.top',
      'tile',
    ]);
    expect(fieldsFor([wall({ door: 'open' })]).map((f) => f.key)).toEqual([
      'kind',
      'door',
      'secret',
      'doorSound',
      'move',
      'sight',
      'light',
      'sound',
      'dir',
      'height.bottom',
      'height.top',
      'tile',
    ]);
  });

  it('sets how high a wall stands, and fastens it to a tile', () => {
    const low = wall({ height: { bottom: 0 } });
    const top = field([low], 'height.top');
    expect(commonValue([low], top)).toBe('');
    expect(top.patch('10', low)).toEqual({ height: { bottom: 0, top: 10 } });
    expect(field([low], 'height.bottom').patch('', low)).toEqual({ height: null });
    expect(field([wall()], 'tile').patch('hut')).toEqual({ tile: 'hut' });
  });

  it('makes a wall one-way, and a door secret or quiet', () => {
    const dir = field([wall()], 'dir');
    expect(commonValue([wall()], dir)).toBe('');
    expect(dir.patch('left')).toEqual({ dir: 'left' });
    expect(dir.patch('')).toEqual({ dir: null });
    const door = wall({ door: 'closed' });
    expect(field([door], 'secret').patch(true)).toEqual({ secret: true });
    const sound = field([door], 'doorSound');
    expect(commonValue([door], sound)).toBe('wood');
    expect(sound.patch('wood')).toEqual({ doorSound: null });
    expect(sound.patch('none')).toEqual({ doorSound: 'none' });
  });

  it('turns field input into a patch: empty removes, numbers stay numbers, checks set or remove', () => {
    expect(field([light], 'color').patch('')).toEqual({ color: null });
    expect(field([light], 'bright').patch('15')).toEqual({ bright: 15 });
    expect(field([light], 'darkness').patch(true)).toEqual({ darkness: true });
    expect(field([light], 'darkness').patch(false)).toEqual({ darkness: null });
  });

  it('aims a beam, and lets a light shine through walls', () => {
    const beam = { ...light, angle: 60 };
    expect(fieldsFor([beam]).map((f) => f.key)).toContain('rotation');
    expect(field([beam], 'rotation').patch('90')).toEqual({ rotation: 90 });
    const through = field([light], 'walls');
    expect(commonValue([light], through)).toBe(false);
    expect(through.patch(true)).toEqual({ walls: false });
    expect(through.patch(false)).toEqual({ walls: null });
    expect(commonValue([{ ...light, walls: false }], through)).toBe(true);
  });

  it('shows rect tile fields for rect tiles and the picture for image tiles', () => {
    const rect: Doc = { id: 't', type: 'tile', rev: 1, kind: 'rect', x: 0, y: 0, w: 1, h: 1, color: '#000' };
    const image: Doc = { id: 'i', type: 'tile', rev: 1, kind: 'image', x: 0, y: 0, w: 1, h: 1, src: 'a.png' };
    const both = ['name', 'x', 'y', 'w', 'h', 'background', 'locked'];
    expect(fieldsFor([rect]).map((f) => f.key)).toEqual([...both, 'color', 'texture']);
    expect(fieldsFor([image]).map((f) => f.key)).toEqual([...both, 'src']);
    expect(fieldsFor([rect, image]).map((f) => f.key)).toEqual(both);
  });

  it('shows a group its name and lock only', () => {
    const group: Doc = { id: 'g', type: 'tile', rev: 1, kind: 'group' };
    expect(fieldsFor([group]).map((f) => f.key)).toEqual(['name', 'locked']);
  });

  it('lets the GM hide tokens', () => {
    const token: Doc = { id: 'k', type: 'token', rev: 1, x: 0, y: 0 };
    expect(commonValue([token], field([token], 'hidden'))).toBe(false);
  });

  it('edits drawings: line, fill, and the words of a text box', () => {
    const box: Doc = { id: 'd', type: 'drawing', rev: 1, shape: 'rect', x: 0, y: 0, w: 10, h: 10 };
    expect(fieldsFor([box]).map((f) => f.key)).toEqual([
      'stroke',
      'strokeWidth',
      'fill',
      'fillAlpha',
      'level',
      'hidden',
      'locked',
    ]);
    const text = { ...box, shape: 'text', text: 'Hi' };
    expect(fieldsFor([text]).map((f) => f.key)).toEqual(['text', 'fontSize', 'textColor', 'level', 'hidden', 'locked']);
  });

  it('points a note at a journal entry picked from those there are', () => {
    const note: Doc = { id: 'n', type: 'note', rev: 1, x: 0, y: 0 };
    const entry = field([note], 'entry');
    expect(entry.choices).toBe('journals');
    expect(entry.patch('lore')).toEqual({ entry: 'lore' });
    expect(entry.patch('')).toEqual({ entry: null });
  });

  it("sets a region's first behaviour and its details", () => {
    const region: Doc = { id: 'r', type: 'region', rev: 1, points: [], behaviors: [] };
    const kind = field([region], 'behavior');
    expect(kind.patch('difficult')).toEqual({ behaviors: [{ type: 'difficult' }] });
    expect(kind.patch('')).toEqual({ behaviors: [] });
    const message = { ...region, behaviors: [{ type: 'message', text: 'Boo' }] };
    expect(commonValue([message], kind)).toBe('message');
    const text = field([message], 'behavior.text');
    expect(commonValue([message], text)).toBe('Boo');
    expect(text.patch('Hello', message)).toEqual({ behaviors: [{ type: 'message', text: 'Hello' }] });
    expect(fieldsFor([region]).some((f) => f.key === 'behavior.text')).toBe(false);
  });

  it('edits templates, sounds and their darkness bands', () => {
    const template: Doc = { id: 't', type: 'template', rev: 1, shape: 'cone', x: 0, y: 0, distance: 15 };
    expect(fieldsFor([template]).map((f) => f.key)).toEqual([
      'distance',
      'direction',
      'angle',
      'color',
      'level',
      'hidden',
      'locked',
    ]);
    const sound: Doc = { id: 's', type: 'sound', rev: 1, x: 0, y: 0, radius: 30, src: 'a.ogg' };
    expect(fieldsFor([sound]).map((f) => f.key)).toContain('src');
  });
});
