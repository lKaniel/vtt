import zoneArt from '../content/zone-art.json' with { type: 'json' };

const BUNDLED_ZONES = new Set<string>(zoneArt);

/** The bundled top-down texture for a lasting spell zone, if we ship one for that spell id. */
export function zoneArtUrl(spellId: string): string | undefined {
  return BUNDLED_ZONES.has(spellId) ? `/art/textures/zones/${spellId}.webp` : undefined;
}
