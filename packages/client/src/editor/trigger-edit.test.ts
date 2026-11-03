import { describe, expect, it } from 'vitest';
import { blankStep, getStep, problemOf, setStep, stepFields, stepTypes } from './trigger-edit.ts';

describe('trigger steps', () => {
  it('offers the trigger actions on tiles, and the region behaviours too on regions', () => {
    expect(stepTypes('tile')).toEqual([
      'image',
      'visibility',
      'sound',
      'teleport',
      'door',
      'message',
      'activate',
      'journal',
    ]);
    expect(stepTypes('region')).toEqual(expect.arrayContaining(['difficult', 'trap', 'level', 'reveal', 'door']));
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

  it('has fields for every step type', () => {
    for (const type of stepTypes('region')) expect(Array.isArray(stepFields(type))).toBe(true);
    expect(stepFields('door').map((f) => f.key)).toEqual(['wall', 'to']);
  });

  it('says what is missing before saving', () => {
    expect(problemOf([blankStep('message')], 'tile')).toMatch(/^Step 1/);
    expect(problemOf([{ type: 'message', text: 'Hi' }], 'tile')).toBeUndefined();
    expect(problemOf([{ type: 'reveal' }], 'tile')).toMatch(/^Step 1/);
    expect(problemOf([{ type: 'reveal' }], 'region')).toBeUndefined();
  });
});
