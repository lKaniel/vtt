import type { TokenView } from '@vtt/system-dnd5e';

// The GM's encounter picker: who on the scene may fight, and who is ticked
// when it opens (the creatures selected, else those on screen).

export interface FightCandidate {
  id: string;
  name: string;
  /** One of the party (players' characters and their allies). */
  party: boolean;
  /** Hidden from the players: ticked only when the GM ticks it. */
  hidden: boolean;
}

/** The creatures with stats on the scene: the party first, then the rest, each by name. */
export function fightCandidates(tokens: Iterable<TokenView>, isParty: (t: TokenView) => boolean): FightCandidate[] {
  const all = [...tokens].filter((t) => t.sheet ?? t.health);
  const candidates = all.map((t) => ({ id: t.id, name: t.name, party: isParty(t), hidden: t.hidden }));
  return candidates.sort((a, b) => Number(b.party) - Number(a.party) || a.name.localeCompare(b.name));
}

/** Who is ticked at first: the selected creatures when the GM selected two or more, else those on screen and not hidden. */
export function firstPicks(
  candidates: readonly FightCandidate[],
  selected: readonly string[],
  onScreen: readonly string[],
): string[] {
  const chosen = candidates.filter((c) => selected.includes(c.id));
  if (chosen.length >= 2) return chosen.map((c) => c.id);
  return candidates.filter((c) => !c.hidden && onScreen.includes(c.id)).map((c) => c.id);
}
