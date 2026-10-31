import { applyMapEdit, MapEditError, type MapEdit, type Player } from '@vtt/shared';
import { Refusal, requireGm, type Table } from './table.ts';

/** The GM's map tools: walls, doors, lights, and the time of day. */
export class MapActions {
  constructor(private table: Table) {}

  private get store() {
    return this.table.store;
  }

  edit(player: Player, edit: MapEdit): void {
    requireGm(player);
    let changes;
    try {
      changes = applyMapEdit(this.store.chunks, this.store.world.chunkSize, edit);
    } catch (e) {
      if (e instanceof MapEditError) throw new Refusal(e.message);
      throw e;
    }
    for (const { key, chunk } of changes) this.store.setChunk(key, chunk);
  }

  darkness(player: Player, darkness: number): void {
    requireGm(player);
    this.store.setDarkness(darkness);
  }
}
