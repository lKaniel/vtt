import { isParty } from '@vtt/shared';
import { characterLevel, type Content, levelForXp, nextLevelXp, type Stats, type TokenView } from '@vtt/system-dnd5e';

// What the GM's encounter builder weighs: the party's characters (player
// owned, with class levels) and the monsters on the scene they would face
// (not illusions only some players see, nor summons).

export interface EncounterSide {
  party: { id: string; name: string; level: number }[];
  foes: { id: string; name: string; cr: number }[];
}

export function encounterOf(tokens: Iterable<TokenView>, content: Content): EncounterSide {
  const out: EncounterSide = { party: [], foes: [] };
  for (const t of tokens) {
    const level = characterLevel(t.stats);
    const cr = t.monster ? content.monsters.get(t.monster)?.cr : undefined;
    if (isParty(t) && level && !t.monster) out.party.push({ id: t.id, name: t.name, level });
    else if (!isParty(t) && cr !== undefined && !t.visibleTo && !t.summon)
      out.foes.push({ id: t.id, name: t.name, cr });
  }
  return out;
}

/** Each character's share of the encounter's XP. */
export function xpShares(xp: number, members: number): number {
  return members ? Math.floor(xp / members) : 0;
}

/** "1200/2700 XP", or the level the XP reaches once it's past the character's; undefined without XP. */
export function xpLine(stats: Stats | undefined): string | undefined {
  const xp = stats?.xp;
  const level = characterLevel(stats);
  if (xp === undefined || !level) return undefined;
  const reach = levelForXp(xp);
  if (reach > level) return `${xp} XP, level ${reach} reached`;
  const next = nextLevelXp(level);
  return next ? `${xp}/${next} XP` : `${xp} XP`;
}
