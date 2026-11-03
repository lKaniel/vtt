import type { DocRef } from '@vtt/core';

// Moving things between folders by dragging: what is being moved, and from
// which list, so a folder of actors doesn't take a scene.

const MOVE_TYPE = 'application/x-vtt-folder-move';

export interface MovePayload {
  list: string;
  refs: DocRef[];
}

export function startMove(e: React.DragEvent, payload: MovePayload): void {
  e.dataTransfer.setData(MOVE_TYPE, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copyMove';
}

export const carriesMove = (e: React.DragEvent) => e.dataTransfer.types.includes(MOVE_TYPE);

/** What a drop carries for list `list`, or undefined for anything else. */
export function moveOf(e: React.DragEvent, list: string): DocRef[] | undefined {
  try {
    const payload = JSON.parse(e.dataTransfer.getData(MOVE_TYPE)) as MovePayload;
    return payload.list === list && Array.isArray(payload.refs) ? payload.refs : undefined;
  } catch {
    return undefined;
  }
}
