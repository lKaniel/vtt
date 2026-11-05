// The character creator and level up inside the game (ui/creator/BuilderWindow.tsx),
// as `session.builder`: which one is open, for which of your characters.

export type Building = { mode: 'create' } | { mode: 'edit' | 'levelup'; id: string };

export class Builder {
  current?: Building;

  constructor(private readonly ui: { changed(): void }) {}

  open(building: Building): void {
    this.current = building;
    this.ui.changed();
  }

  close(): void {
    this.current = undefined;
    this.ui.changed();
  }
}
