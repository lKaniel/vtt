import type { Player } from '@vtt/shared';
import { AutomationSchema } from '@vtt/system-dnd5e';
import type { GameStore } from './game-store.ts';
import { Refusal } from './table.ts';

/** A seat sets its own options (D&D's automation, see automation.ts); they replace the old ones. */
export function setSeatSettings(store: GameStore, player: Player, settings: Record<string, string>): void {
  const parsed = AutomationSchema.safeParse(settings);
  if (!parsed.success) throw new Refusal(`Unknown setting: ${parsed.error.issues[0]?.message ?? 'bad value'}`);
  const world = store.world;
  const kept = Object.keys(settings).length ? settings : undefined;
  const players = world.players.map((p) => (p.id === player.id ? { ...p, settings: kept } : p));
  store.setWorld({ ...world, players });
}

/** A seat without its settings: what decides whether a client starts over when its seat changes. */
export function withoutSettings(player: Player): Player {
  const { settings: _settings, ...rest } = player;
  return rest;
}
