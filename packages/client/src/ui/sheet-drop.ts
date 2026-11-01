import type { SheetArea } from '@vtt/system-dnd5e';
import type React from 'react';
import { DRAG_TYPE, type DragPayload } from '../drops.ts';
import type { Session } from '../session.ts';
import { dropOnOpenSheet } from '../session-drops.ts';

// The character sheet as a drop target: compendium entries, pictures and
// other creatures' items. Parts of the sheet say which area they are with
// `data-area` ("inventory", "spells", "features").

const AREAS: readonly string[] = ['inventory', 'spells', 'features'];

/** The sheet area an element is in, if any. */
function areaOf(target: EventTarget | null): SheetArea | undefined {
  const area = target instanceof Element ? target.closest('[data-area]')?.getAttribute('data-area') : undefined;
  return area && AREAS.includes(area) ? (area as SheetArea) : undefined;
}

/** Drag handlers for the sheet window. */
export function sheetDropTarget(session: Session): Pick<React.DOMAttributes<HTMLElement>, 'onDragOver' | 'onDrop'> {
  return {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (e) => {
      const data = e.dataTransfer.getData(DRAG_TYPE);
      if (!data) return;
      e.preventDefault();
      dropOnOpenSheet(session, JSON.parse(data) as DragPayload, areaOf(e.target));
    },
  };
}
