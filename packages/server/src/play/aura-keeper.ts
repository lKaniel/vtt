import { gridKind } from '@vtt/shared';
import { auraEffects, withAuras, withBanishment } from '@vtt/system-dnd5e';
import type { Table } from './table.ts';
import { changeShapes } from './spell-forms.ts';
import { keepGravity } from './falls.ts';
import { keepHolds } from './power-casting.ts';
import { ZonePlacing } from './zone-placements.ts';
import { ZoneTemplates } from './zone-templates.ts';

// Auras kept in step (auras.ts in system-dnd5e): after every change, each
// creature on the scene gets exactly the aura copies that reach it now. It
// runs inside the step that moved them, so one undo takes both back.

class AuraKeeper {
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
    const want = auraEffects(bearers, { gridSize: world.gridSize, grid: gridKind(world) });
    for (const token of tokens) {
      const next = withAuras(token, want.get(token.id) ?? []);
      if (next) store.setToken(next);
    }
  }
}

/** Banished creatures leave the map while the spell lasts (withBanishment). */
function banishments(table: Table): void {
  for (const token of [...table.store.tokens.values()]) {
    const next = withBanishment(token);
    if (next) table.store.setToken(next);
  }
}

/** What every step brings in line after it runs: lasting spell zones' templates, lights and walls, shapes, banishments, lifted creatures, then auras. */
export class AfterStep {
  readonly zoneTemplates: ZoneTemplates;
  private auras: AuraKeeper;
  private placing: ZonePlacing;

  constructor(private table: Table) {
    this.zoneTemplates = new ZoneTemplates(table);
    this.auras = new AuraKeeper(table);
    this.placing = new ZonePlacing(table);
  }

  sync(): void {
    this.zoneTemplates.sync();
    this.placing.sync();
    changeShapes(this.table);
    banishments(this.table);
    keepGravity(this.table);
    keepHolds(this.table);
    this.auras.sync();
  }
}
