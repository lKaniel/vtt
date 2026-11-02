import type { PackCompendium } from '@vtt/core';
import { type Content, contentWith, type Edition, homebrewCompendia } from '@vtt/system-dnd5e';

// What this game's tokens can refer to: the SRD of an edition plus the
// monsters, items, spells and classes of the packs the game turned on, which
// the server sends on joining (`packContent`), and the game's homebrew
// documents as they are now. Sheets, tooltips and the Compendium read it
// here rather than the bare SRD.

let packs: readonly PackCompendium[] = [];
let homebrew: () => readonly { id: string; rev?: number }[] = () => [];
let last: { packs: readonly PackCompendium[]; key: string; list: readonly PackCompendium[] } | undefined;

export function setPackContent(list: readonly PackCompendium[]): void {
  packs = list.filter((c) => c.pack !== 'homebrew');
}

/** Where the game's homebrew documents are read from (the session's documents). */
export function setHomebrewSource(source: () => readonly { id: string; rev?: number }[]): void {
  homebrew = source;
}

/** The same list while nothing changed, so the content built from it is cached. */
function compendia(): readonly PackCompendium[] {
  const docs = homebrew();
  const key = docs.map((d) => `${d.id}@${d.rev ?? 0}`).join(',');
  if (last?.packs === packs && last.key === key) return last.list;
  last = { packs, key, list: docs.length ? [...packs, ...homebrewCompendia(docs)] : packs };
  return last.list;
}

export function gameContent(rules: Edition): Content {
  return contentWith(rules, compendia());
}
