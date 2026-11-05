import type { DrawnTile } from '@vtt/shared';
import { describe, expect, it } from 'vitest';
import { TriggerMarks, triggerMarks } from './triggers3d.ts';

// Tiles with triggers (Monk's Active Tiles) in 3D: often an invisible tile
// over a lever or a pad, so the 3D view marks where they are.

const tile = (id: string, more: Partial<DrawnTile> = {}): DrawnTile =>
  ({ id, kind: 'image', src: '/art/ui/blank.svg', x: 0, y: 0, w: 200, h: 100, ...more }) as DrawnTile;
type Trigger = NonNullable<DrawnTile['trigger']>;
const click: Trigger = { on: 'click', actions: [{ type: 'message', text: 'Clunk' }] };
const step: Trigger = { on: 'enter', actions: [{ type: 'message', text: 'Click' }] };

describe('active tiles in 3D', () => {
  const tiles = [
    tile('lever', { trigger: click }),
    tile('lever', { trigger: click }),
    tile('trap', { x: 400, trigger: step }),
    tile('secret', { trigger: { ...click, gmOnly: true } }),
    tile('spent', { trigger: { ...click, disabled: true } }),
    tile('rug'),
  ];

  it('marks what players may click, once each, over its middle', () => {
    expect(triggerMarks(tiles, false)).toEqual([{ id: 'lever', at: [100, 50], kind: 'click' }]);
  });

  it('shows the GM the hidden ones too: their own clicks and what goes off underfoot', () => {
    expect(triggerMarks(tiles, true).map((m) => [m.id, m.kind])).toEqual([
      ['lever', 'click'],
      ['trap', 'step'],
      ['secret', 'click'],
    ]);
  });

  it('floats a marker over each, above what is there', () => {
    const marks = new TriggerMarks();
    marks.show(triggerMarks(tiles, true), () => 40, 20);
    expect(marks.group.children).toHaveLength(3);
    expect(marks.group.children[0]!.position.y).toBeGreaterThan(40);
    marks.show([], () => 0, 20);
    expect(marks.group.children).toHaveLength(0);
  });
});
