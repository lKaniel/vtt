import type { PackCompendium } from '@vtt/core';
import { type Content, contentWith, type Edition } from '@vtt/system-dnd5e';

// What this game's tokens can refer to: the SRD of an edition plus the
// monsters, items and spells of the packs the game turned on, which the
// server sends on joining (`packContent`). Sheets, tooltips and the
// Compendium read it here rather than the bare SRD.

let compendia: readonly PackCompendium[] = [];

export function setPackContent(list: readonly PackCompendium[]): void {
  compendia = list;
}

export function gameContent(rules: Edition): Content {
  return contentWith(rules, compendia);
}
