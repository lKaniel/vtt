import type { Doc } from '@vtt/core';
import type { ServerMessage } from '@vtt/system-dnd5e';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from './session.ts';
import { closeSession, openSession, welcome, type FakeWebSocket } from './session.fixtures.ts';

let session: Session;
let ws: FakeWebSocket;

beforeEach(() => {
  ({ session, ws } = openSession());
});

afterEach(() => closeSession(session));

const rect = (
  id: string,
  [x, y, w, h]: [number, number, number, number],
  extra: Record<string, unknown> = {},
): Doc => ({
  id,
  type: 'tile',
  rev: 1,
  kind: 'rect',
  color: '#888888',
  x,
  y,
  w,
  h,
  ...extra,
});

function gmWelcome(): ServerMessage {
  return {
    ...(welcome([]) as Extract<ServerMessage, { t: 'welcome' }>),
    you: { id: 'gm', name: 'GM', role: 'gm', color: '#fc0' },
    docs: {
      'main/tiles': [
        rect('ground', [0, 0, 3000, 3000], { background: true, sort: 'A' }),
        rect('house', [1000, 1000, 600, 600], { sort: 'B' }),
        { id: 'camp', type: 'tile', rev: 1, kind: 'group', sort: 'C' },
        rect('tent', [100, 100, 100, 100], { parent: 'camp', sort: 'V' }),
        rect('fire', [300, 100, 100, 100], { parent: 'camp', sort: 'W' }),
        rect('crate', [2000, 2000, 100, 100], { sort: 'D' }),
      ],
      'main/walls': [
        { id: 'tent-wall', type: 'wall', rev: 1, a: [100, 100], b: [200, 100], tile: 'tent' },
        { id: 'loose', type: 'wall', rev: 1, a: [0, 0], b: [100, 0] },
      ],
      'main/lights': [{ id: 'fire-glow', type: 'light', rev: 1, x: 350, y: 150, bright: 10, dim: 10, tile: 'fire' }],
    },
  };
}

interface SentOp {
  op: string;
  coll: string;
  id?: string;
  rev?: number;
  patch?: Record<string, unknown>;
  doc?: Doc;
}
const lastOps = () =>
  (ws.sent as { t: string; txn?: string; label?: string; ops?: SentOp[] }[]).filter((m) => m.t === 'ops').at(-1);
const key = (id: string) => `main/tiles#${id}`;
const patchOf = (id: string) => lastOps()?.ops?.find((o) => o.id === id)?.patch;

beforeEach(() => {
  ws.receive(gmWelcome());
  session.setMode('tiles');
});

describe('moving tiles', () => {
  it('moves what is in a group with it, and not the group itself', () => {
    session.moveSelection([key('camp')], [100, 0], false);
    expect(
      lastOps()
        ?.ops?.map((o) => o.id)
        .sort(),
    ).toEqual(['fire', 'fire-glow', 'tent', 'tent-wall']);
    expect(patchOf('tent')).toEqual({ x: 200 });
  });

  it('takes the walls and lights fastened to the tiles along', () => {
    session.moveSelection([key('camp')], [100, 0], false);
    const ops = lastOps()!.ops!;
    expect(ops.find((o) => o.id === 'tent-wall')).toMatchObject({
      coll: 'main/walls',
      patch: { a: [200, 100], b: [300, 100] },
    });
    expect(ops.find((o) => o.id === 'fire-glow')).toMatchObject({ coll: 'main/lights', patch: { x: 450 } });
    expect(ops.find((o) => o.id === 'loose')).toBeUndefined();
  });

  it('a tile dropped on another goes inside it, on top', () => {
    session.moveSelection([key('crate')], [-800, -800], false);
    expect(patchOf('crate')).toMatchObject({ x: 1200, y: 1200, parent: 'house' });
  });

  it('nudges a group with the arrow keys', () => {
    session.setSelection([key('camp')]);
    session.nudge([0, 1], false);
    expect(patchOf('fire')).toEqual({ y: 101 });
  });

  it('resizing a group scales the tiles in it', () => {
    session.reshape(key('camp'), 'e', [700, 150], false);
    expect(patchOf('fire')).toEqual({ x: 500, w: 200 });
    expect(patchOf('camp')).toBeUndefined();
  });
});

describe('grouping', () => {
  it('groups the selection in one step and selects the group', () => {
    session.setSelection([key('house'), key('crate')]);
    session.group();
    const ops = lastOps()!;
    expect(ops.label).toBe('group');
    expect(ops.ops?.[0]).toMatchObject({ op: 'create', doc: { id: 'group', kind: 'group' } });
    expect(patchOf('house')).toMatchObject({ parent: 'group' });
    expect(session.selection).toEqual([key('group')]);
    expect(session.docs.get('main/tiles', 'group')).toBeDefined();
  });

  it('takes a group back when the server refuses it', () => {
    session.setSelection([key('house'), key('crate')]);
    session.group();
    ws.receive({ t: 'reject', txn: lastOps()!.txn!, reason: 'No' });
    expect(session.docs.get('main/tiles', 'group')).toBeUndefined();
    expect(session.docs.get('main/tiles', 'house')?.parent).toBeUndefined();
  });

  it('ungroups, selecting what was in the group', () => {
    session.setSelection([key('camp')]);
    session.ungroup();
    expect(lastOps()?.ops?.at(-1)).toEqual({ op: 'delete', coll: 'main/tiles', id: 'camp' });
    expect(session.selection.toSorted((a, b) => a.localeCompare(b))).toEqual([key('fire'), key('tent')]);
  });
});

describe('order and locks', () => {
  it('brings the selection to the front', () => {
    session.setSelection([key('house')]);
    session.reorder('front');
    expect(patchOf('house')).toEqual({ sort: expect.any(String) as string });
    expect((patchOf('house')!.sort as string) > 'D').toBe(true);
  });

  it('locks and unlocks the selection', () => {
    session.setSelection([key('house'), key('crate')]);
    session.toggleLock();
    expect(lastOps()).toMatchObject({ label: 'lock', ops: [{ patch: { locked: true } }, { patch: { locked: true } }] });
    session.toggleLock();
    expect(patchOf('house')).toEqual({ locked: null });
  });

  it('moves tiles into a group from the layers panel', () => {
    session.moveTiles(['crate'], 'camp', 0);
    expect(patchOf('crate')).toMatchObject({ parent: 'camp' });
  });
});

describe('drawing tiles', () => {
  it('draws a tile into the container under it, and selects it', () => {
    session.createTile({ x: 1100, y: 1100, w: 200, h: 100 }, 'wood');
    const op = lastOps()?.ops?.[0];
    expect(op).toMatchObject({ op: 'create', doc: { kind: 'rect', texture: 'wood', parent: 'house', x: 1100 } });
    expect(session.selection).toEqual([key(op!.doc!.id)]);
  });

  it('draws the preset picked last', () => {
    session.setTilePreset('cobble');
    session.createTile({ x: 2500, y: 2500, w: 100, h: 100 });
    expect(lastOps()?.ops?.[0]?.doc).toMatchObject({ id: 'cobble', texture: 'cobble', color: '#8a8580' });
  });

  it('puts new ground under everything', () => {
    session.createTile({ x: 0, y: 0, w: 500, h: 500 }, 'grass');
    const doc = lastOps()?.ops?.[0]?.doc;
    expect(doc).toMatchObject({ background: true });
    expect((doc!.sort as string) < 'A').toBe(true);
  });
});
