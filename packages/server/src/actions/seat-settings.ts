import type { Player } from '@vtt/shared';
import { AutomationSchema, GameSettingsSchema } from '@vtt/system-dnd5e';
import type { GameStore } from '../store/game-store.ts';
import { Refusal, requireGm } from '../play/table.ts';

/** A seat sets its own options (D&D's automation, see automation.ts); they replace the old ones. */
export function setSeatSettings(store: GameStore, player: Player, settings: Record<string, string>): void {
  const parsed = AutomationSchema.safeParse(settings);
  if (!parsed.success) throw new Refusal(`Unknown setting: ${parsed.error.issues[0]?.message ?? 'bad value'}`);
  const world = store.world;
  const kept = Object.keys(settings).length ? settings : undefined;
  const players = world.players.map((p) => (p.id === player.id ? { ...p, settings: kept } : p));
  store.setWorld({ ...world, players });
}

/** GM: the game's rules edition and options (D&D's, see game-settings.ts); they replace the old ones. */
export function setGameSettings(
  store: GameStore,
  player: Player,
  msg: { rules?: string; settings: Record<string, string> },
): void {
  requireGm(player);
  const parsed = GameSettingsSchema.safeParse(msg.settings);
  if (!parsed.success) throw new Refusal(`Unknown setting: ${parsed.error.issues[0]?.message ?? 'bad value'}`);
  if (msg.rules && !store.system.editions.some((e) => e.id === msg.rules))
    throw new Refusal(`This game's system has no "${msg.rules}" rules`);
  const settings = Object.keys(msg.settings).length ? msg.settings : undefined;
  store.setWorld({ ...store.world, rules: msg.rules ?? store.world.rules, settings });
}

const COLOR = /^#[\da-f]{6}$/i;

/** A seat sets its own colour and picture; a null avatar takes the picture away. */
export function setProfile(store: GameStore, player: Player, msg: { color?: string; avatar?: string | null }): void {
  if (msg.color !== undefined && !COLOR.test(msg.color)) throw new Refusal('A colour is written #rrggbb');
  const world = store.world;
  const players = world.players.map((p) => (p.id === player.id ? profiled(p, msg) : p));
  store.setWorld({ ...world, players });
}

function profiled(p: Player, { color, avatar }: { color?: string; avatar?: string | null }): Player {
  const { avatar: _old, ...rest } = p;
  const next = avatar === undefined ? p.avatar : (avatar ?? undefined);
  return { ...rest, ...(color && { color }), ...(next && { avatar: next }) };
}

/** Who a chat card is from: a seat's name, colour and picture. */
export function signedBy(player: Player): { from: string; color: string; avatar?: string } {
  return { from: player.name, color: player.color, ...(player.avatar && { avatar: player.avatar }) };
}

/** A seat without its settings: what decides whether a client starts over when its seat changes. */
export function withoutSettings(player: Player): Player {
  const { settings: _settings, ...rest } = player;
  return rest;
}
