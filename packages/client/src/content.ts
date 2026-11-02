import type { PackCompendium } from '@vtt/core';
import { type Content, contentWith, type Edition, gameCompendia, withOwn, withSettings } from '@vtt/system-dnd5e';

// What this game's tokens can refer to: the SRD of an edition plus the
// monsters, items, spells and classes of the packs the game turned on, which
// the server sends on joining (`packContent`), and the game's homebrew
// documents as they are now, played with the game's settings. Sheets, tooltips and the Compendium read it
// here rather than the bare SRD.

let packs: readonly PackCompendium[] = [];
let homebrew: () => readonly { id: string; rev?: number }[] = () => [];
let settings: () => Readonly<Record<string, string>> | undefined = () => undefined;
/** Keys the compendia cache: this browser plays one game at a time. */
const THIS_GAME = {};

export function setPackContent(list: readonly PackCompendium[]): void {
  packs = list.filter((c) => c.pack !== 'homebrew');
}

/** Where the game's homebrew documents are read from (the session's documents). */
export function setHomebrewSource(source: () => readonly { id: string; rev?: number }[]): void {
  homebrew = source;
}

/** Where the game's settings are read from (the session's world). */
export function setSettingsSource(source: () => Readonly<Record<string, string>> | undefined): void {
  settings = source;
}

export function gameContent(rules: Edition): Content {
  return withSettings(contentWith(rules, gameCompendia(THIS_GAME, packs, homebrew())), settings());
}

type Own = Parameters<typeof withOwn>[1];

/**
 * What a creature can refer to: the game's content in its edition plus the
 * items and spells made on its own sheet (the server's `contentFor`). Only a
 * token whose sheet you see has an inventory or own entries to look up, so
 * one without a sheet falls back to `rules`.
 */
export function contentFor(token: Own & { sheet?: { edition: Edition } }, rules: Edition = '2014'): Content {
  return withOwn(gameContent(token.sheet?.edition ?? rules), token);
}
