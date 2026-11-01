// Pictures a game brings itself (map tiles, portraits it uploaded) live in
// that game's assets folder, served at /games/<id>/assets/. A path saved as
// "/assets/..." or a bare tile path means "this game's assets"; bundled art
// (/art/...) and other sites are left alone. "pack://<pack>/<path>" is a
// file of an asset pack, served at /packs/<pack>/<path>.

import { packUrl } from '@vtt/core';

let game: string | undefined;

/** The game whose assets pictures come from; undefined is the home game's /assets/. */
export function setAssetGame(id: string | undefined): void {
  game = id;
}

export function assetUrl(src: string): string {
  const pack = packUrl(src);
  if (pack) return pack;
  if (!src.startsWith('/assets/') && /^(\/|[a-z]+:)/.test(src)) return src;
  const rel = src.startsWith('/assets/') ? src.slice(8) : src;
  return game ? `/games/${game}/assets/${rel}` : `/assets/${rel}`;
}
