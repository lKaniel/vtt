import type { TriggerAction } from '@vtt/shared';
import type { MonkAction } from './foundry-monks-flow.ts';
import { type ActionContext, entityOf, targets } from './foundry-monks-index.ts';

// More of Monk's Active Tiles as our trigger actions: opening a journal,
// turning tiles and light beams, showing a scene, moving the creature to a
// spot or a tile, and the distance filter that keeps a tile to creatures
// close by (a trigger's `near`).

const lastId = (uuid: unknown) => (typeof uuid === 'string' ? uuid.split('.').pop() : undefined);

/** Monk's "open journal": the entry (at its page) opened for the players. */
export function journalOf(a: MonkAction, c: ActionContext): TriggerAction[] {
  const id = lastId(entityOf(a.data));
  const entry = id ? c.entry?.(id) : undefined;
  if (!entry) return [];
  const page = typeof a.data?.page === 'string' ? c.page?.(a.data.page) : undefined;
  return [{ type: 'journal', entry, ...(page && { page }) }];
}

/** "+ 90", "- 45": turned by; "45": turned to. */
const TURN = /^([+-])\s+(\d+(?:\.\d+)?)$|^(-?\d+(?:\.\d+)?)$/;

/** Monk's "rotation" of tiles or lights (creatures don't turn here). */
export function rotationOf(a: MonkAction, c: ActionContext): TriggerAction[] {
  const raw = a.data?.rotation;
  const m = TURN.exec(typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : '');
  if (!m) return [];
  const turn = m[3] === undefined ? { by: Number(m[2]) * (m[1] === '-' ? -1 : 1) } : { to: Number(m[3]) };
  return targets(entityOf(a.data), c, ['tiles', 'lights']).map((t) => ({
    type: 'rotate' as const,
    target: { coll: t.coll as 'tiles' | 'lights', id: t.id },
    ...turn,
  }));
}

/** Monk's "change scene": shown to whoever set it off, or to everyone when it makes the scene the active one. */
export function sceneViewOf(a: MonkAction, c: ActionContext): TriggerAction[] {
  const raw = a.data?.sceneid;
  const id = lastId(typeof raw === 'string' ? raw : (raw as { id?: unknown } | undefined)?.id);
  const scene = id ? c.scene(id) : undefined;
  if (!scene) return [];
  const everyone = a.data?.activate === true || a.data?.for === 'everyone' || a.data?.for === 'players';
  return [{ type: 'view', scene, ...(everyone && { everyone: true }) }];
}

/** The middle of the tile Monk's names as a place. */
function tileMiddle(entity: string, c: ActionContext): [number, number] | undefined {
  const [tile] = targets(entity, c, ['tiles']);
  const raw = tile && c.index.rawOf(tile);
  const n = (k: string) => (typeof raw?.[k] === 'number' ? raw[k] : 0);
  return raw ? [n('x') + Math.abs(n('width')) / 2, n('y') + Math.abs(n('height')) / 2] : undefined;
}

/** Monk's "move token" of the creature that set it off: to a spot or a tile (as a teleport). */
export function moveOf(a: MonkAction, c: ActionContext): TriggerAction[] {
  const who = entityOf(a.data);
  if (who !== undefined && who !== 'token' && who !== 'previous') return [];
  const at = (a.data?.location ?? {}) as { x?: unknown; y?: unknown; id?: unknown };
  if (typeof at.x === 'number' && typeof at.y === 'number')
    return [{ type: 'teleport', to: [Math.round(at.x), Math.round(at.y)] }];
  const middle = typeof at.id === 'string' ? tileMiddle(at.id, c) : undefined;
  return middle ? [{ type: 'teleport', to: middle }] : [];
}

/**
 * Monk's distance filter as how near a creature must be (pixels): "inside
 * the tile" is 0. None without one (or when it lets everyone through); null
 * when it asks for something else (further than).
 */
export function nearOf(actions: readonly MonkAction[], gridSize = 100): number | null | undefined {
  const d = actions.find((a) => a.action === 'distance')?.data;
  if (!d || d.continue === 'always') return undefined;
  if (d.measure === 'lt') return 0;
  if (d.measure !== undefined && d.measure !== 'lte' && d.measure !== 'eq') return null;
  const value = distanceIn(d);
  if (value === undefined) return null;
  return d.unit === 'px' ? value : value * gridSize;
}

/** The distance a filter names ({ value } or a number); 1 when it names none. */
function distanceIn(d: Record<string, unknown>): number | undefined {
  const raw = (d.distance as { value?: unknown } | undefined)?.value ?? d.distance ?? 1;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
