import { SystemRegistry } from '@vtt/core';
import { dnd5e, type Dnd5eSystem } from '@vtt/system-dnd5e';

/**
 * The game systems this server runs games on; a game names its own in
 * game.json (`system`). Installing a new system package means adding it
 * here. Only D&D 5e so far, so the server's action handlers still speak
 * D&D directly (see docs/systems.md).
 */
export const SYSTEMS = new SystemRegistry<Dnd5eSystem>([dnd5e]);
