import { describe, expect, it } from 'vitest';
import { migrate, type Migration } from './migrate.ts';

const steps: Migration[] = [
  // v1 → v2: walls got separate sight and move rules.
  (doc) => ({ ...doc, move: 'blocks', sight: doc.sight === false ? 'passes' : 'blocks' }),
  // v2 → v3: renamed "door" states.
  (doc) => ({ ...doc, door: doc.door === 'shut' ? 'closed' : doc.door }),
];

describe('migrate', () => {
  it('runs every step from the stored version up to the current one', () => {
    const out = migrate({ id: 'w1', sight: false, door: 'shut' }, steps);
    expect(out).toEqual({ id: 'w1', sight: 'passes', move: 'blocks', door: 'closed', v: 3 });
  });

  it('starts from the version the document says it has', () => {
    const out = migrate({ id: 'w1', v: 2, door: 'shut' }, steps);
    expect(out).toEqual({ id: 'w1', door: 'closed', v: 3 });
  });

  it('leaves a current document alone', () => {
    const doc = { id: 'w1', v: 3 };
    expect(migrate(doc, steps)).toBe(doc);
  });

  it('refuses a document from a newer version than it knows', () => {
    expect(() => migrate({ id: 'w1', v: 9 }, steps)).toThrow(/newer/);
  });
});
