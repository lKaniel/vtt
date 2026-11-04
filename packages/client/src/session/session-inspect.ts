import type { ObjectRef } from '../play/objects.ts';

// The inspect card (BG3's right-click "Inspect"): which object on the map it
// shows; and the object under the pointer, which glows. The card reads the object afresh each time it draws (objects.ts), so
// a door that swings shuts shows it. Reached as `session.inspect`.

export class Inspecting {
  /** The object whose card is open. */
  current?: ObjectRef;
  /** The object under the pointer, outlined on the map (ChunkLayer) and in 3D (View3D) as in BG3. */
  hover?: ObjectRef;

  constructor(private readonly on: { changed(): void }) {}

  /** Opens an object's card, or closes it. */
  open(ref: ObjectRef | undefined): void {
    this.current = ref;
    this.on.changed();
  }
}
