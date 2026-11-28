import { useState, type DragEvent, type ReactNode } from 'react';
import type { Session } from '../session/session.ts';

// The GM drags a portrait along the turn order to give it a new place: it
// lands between the two it is dropped between and takes the initiative of
// the last one it passes (the same rule as the menu's arrows). A line marks
// where it will land.

const TYPE = 'application/x-vtt-turn';

/** Where a drop lands: before the portrait at `slot` (the order's length: at the end). */
interface Drag {
  from: number;
  slot?: number;
}

/** The move a drop asks for: from `from` to before `slot`, in places (0: stays). */
function dropShift(from: number, slot: number): number {
  return (slot > from ? slot - 1 : slot) - from;
}

/** The line beside the portrait at `index` where the dragged one would land. */
function dropMark(drag: Drag | undefined, index: number): 'before' | 'after' | undefined {
  if (drag?.slot === index && drag.from !== index) return 'before';
  if (drag?.slot === index + 1 && drag.from !== index) return 'after';
  return undefined;
}

/** The drag going on in the turn order, and the props each portrait's slot takes. */
export function useTurnDrag(session: Session) {
  const [drag, setDrag] = useState<Drag>();
  const order = session.combat?.order ?? [];
  const slotOf = (index: number, event: DragEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientX > box.left + box.width / 2 ? index + 1 : index;
  };
  const drop = (index: number, event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const token = event.dataTransfer.getData(TYPE);
    const from = order.findIndex((e) => e.token === token);
    if (from >= 0) session.hud.moveInOrder(token, dropShift(from, slotOf(index, event)));
    setDrag(undefined);
  };
  return (index: number, draggable: boolean) => ({
    draggable,
    'data-drop': dropMark(drag, index),
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.dataTransfer.setData(TYPE, order[index]!.token);
      event.dataTransfer.effectAllowed = 'move';
      setDrag({ from: index });
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(TYPE)) return;
      event.preventDefault();
      const slot = slotOf(index, event);
      if (drag && drag.slot !== slot) setDrag({ ...drag, slot });
    },
    onDrop: (event: DragEvent<HTMLElement>) => drop(index, event),
    onDragEnd: () => setDrag(undefined),
  });
}

type SlotProps = ReturnType<ReturnType<typeof useTurnDrag>>;

/** One place in the turn order the GM can drag from and drop onto. */
export function TurnSlot({ slot, children }: Readonly<{ slot?: SlotProps; children: ReactNode }>) {
  return (
    <div
      className="relative flex flex-none data-[drop]:before:absolute data-[drop]:before:inset-y-1 data-[drop]:before:z-20 data-[drop]:before:w-0.5 data-[drop]:before:rounded-full data-[drop]:before:bg-gold-bright data-[drop]:before:shadow-[0_0_8px_var(--gold)] data-[drop]:before:content-[''] data-[drop=after]:before:-right-1.5 data-[drop=before]:before:-left-1.5"
      data-slot="turn-slot"
      {...slot}
    >
      {children}
    </div>
  );
}
