import { describe, expect, it } from 'vitest';
import { blankStep, getStep, problemOf, setStep, stepFields, stepTypes } from './trigger-edit.ts';

describe('trigger steps', () => {
  it('offers the trigger actions on tiles, and the region behaviours too on regions', () => {
    expect(stepTypes('tile')).toEqual([
      'image',
      'visibility',
      'sound',
      'teleport',
      'level',
      'stairs',
      'door',
      'message',
      'activate',
      'elevation',
      'shift',
      'journal',
      'rotate',
      'view',
      'choice',
    ]);
    expect(stepTypes('region')).toEqual(
      expect.arrayContaining(['difficult', 'trap', 'level', 'stairs', 'elevator', 'fall', 'reveal', 'door']),
    );
  });

  it('reads and writes nested fields: a target, a point, a list of pictures', () => {
    let step = blankStep('visibility');
    step = setStep(step, 'target.id', 'chest');
    expect(step).toEqual({ type: 'visibility', target: { coll: 'tiles', id: 'chest' }, to: 'toggle' });
    let tp = setStep(blankStep('teleport'), 'to.1', '250');
    tp = setStep(tp, 'scene', '');
    expect(tp).toEqual({ type: 'teleport', to: [0, 250] });
    const image = setStep(blankStep('image'), 'images', '/a.png, /b.png ,');
    expect(image).toEqual({ type: 'image', images: ['/a.png', '/b.png'] });
    expect(getStep(image, 'images')).toBe('/a.png, /b.png');
    expect(getStep(setStep(blankStep('message'), 'gmOnly', true), 'gmOnly')).toBe(true);
  });

  it('builds stairs between two levels and an elevator to some floors', () => {
    expect(stepTypes('region')).toEqual(expect.arrayContaining(['stairs', 'elevator']));
    let stairs = setStep(blankStep('stairs'), 'between.0', 'ground');
    stairs = setStep(stairs, 'between.1', 'loft');
    expect(stairs).toEqual({ type: 'stairs', between: ['ground', 'loft'] });
    expect(problemOf([stairs], 'region')).toBeUndefined();
    expect(setStep(blankStep('elevator'), 'floors', 'cellar, loft')).toEqual({
      type: 'elevator',
      floors: ['cellar', 'loft'],
    });
    expect(problemOf([blankStep('elevator')], 'region')).toBeUndefined();
  });

  it('builds a lift that raises a tile, and a sliding door', () => {
    expect(problemOf([setStep(blankStep('elevation'), 'by', '-20')], 'tile')).toBeUndefined();
    let lift = setStep(blankStep('elevation'), 'target.coll', 'tiles');
    lift = setStep(lift, 'target.id', 'cage');
    expect(lift).toEqual({ type: 'elevation', by: 10, target: { coll: 'tiles', id: 'cage' } });
    const door = setStep(blankStep('shift'), 'target.id', 'cell');
    expect(setStep(door, 'by.1', '130')).toEqual({
      type: 'shift',
      target: { coll: 'tiles', id: 'cell' },
      by: [0, 130],
    });
    expect(problemOf([door], 'tile')).toBeUndefined();
  });

  it('has fields for every step type', () => {
    for (const type of stepTypes('region')) expect(Array.isArray(stepFields(type))).toBe(true);
    expect(stepFields('door').map((f) => f.key)).toEqual(['wall', 'to']);
  });

  it('turns a tile, shows a scene and asks a question', () => {
    const turn = setStep(setStep(blankStep('rotate'), 'target.id', 'wheel'), 'by', '90');
    expect(turn).toEqual({ type: 'rotate', target: { coll: 'tiles', id: 'wheel' }, by: 90 });
    expect(problemOf([turn, setStep(blankStep('view'), 'scene', 'cellar')], 'tile')).toBeUndefined();
    const ask = setStep(blankStep('choice'), 'text', 'Pull the lever?');
    expect(problemOf([ask], 'tile')).toBeUndefined();
    expect(stepFields('choice').map((f) => f.key)).toEqual(['title', 'text']);
  });

  it('says what is missing before saving', () => {
    expect(problemOf([blankStep('message')], 'tile')).toMatch(/^Step 1/);
    expect(problemOf([{ type: 'message', text: 'Hi' }], 'tile')).toBeUndefined();
    expect(problemOf([{ type: 'reveal' }], 'tile')).toMatch(/^Step 1/);
    expect(problemOf([{ type: 'reveal' }], 'region')).toBeUndefined();
  });
});
