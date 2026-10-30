export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyForLevel(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}
