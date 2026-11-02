import { isGridless } from '@vtt/shared';
import { auraEffects, withAuras } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';

// Auras kept in step (auras.ts in system-dnd5e): after every change, each
// creature on the scene gets exactly the aura copies that reach it now. It
// runs inside the step that moved them, so one undo takes both back.

export class AuraKeeper {
  constructor(private table: Table) {}

  /** Puts on and takes off aura copies on the scene the store reads now. */
  sync(): void {
    const store = this.table.store;
    const tokens = [...store.tokens.values()];
    const bearers = tokens.flatMap((token) => {
      const sheet = this.table.sheetOf(token);
      return sheet ? [{ token, sheet }] : [];
    });
    const world = store.world;
    const want = auraEffects(bearers, { gridSize: world.gridSize, gridless: isGridless(world) });
    for (const token of tokens) {
      const next = withAuras(token, want.get(token.id) ?? []);
      if (next) store.setToken(next);
    }
  }
}
