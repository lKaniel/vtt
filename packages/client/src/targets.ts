import type { Player } from '@vtt/shared';

// The creatures each player targets, as in Foundry: T over a creature
// toggles it, T over empty ground lets them all go. Your targets go to the
// table and the others' come back (only the ones you can see); an armed
// attack or an aimed spell goes straight at them. Nothing is saved.

export interface Targeter {
  player: string;
  name: string;
  color: string;
}

/** What the server says someone else targets now. */
export type TargetNews = Targeter & { t: 'targets'; tokens: string[] };

interface TargetHooks {
  send: (msg: { t: 'target'; tokens: string[] }) => void;
  /** Your targets or the others' changed. */
  changed: () => void;
  you: () => Pick<Player, 'id' | 'name' | 'color'> | undefined;
}

export class Targets {
  /** The tokens you target, in the order you picked them. */
  readonly mine = new Set<string>();
  private others = new Map<string, Targeter & { tokens: Set<string> }>();

  constructor(private hooks: TargetHooks) {}

  /** Targets `id`, or lets it go if you already do. */
  toggle(id: string): void {
    if (!this.mine.delete(id)) this.mine.add(id);
    this.tell();
  }

  /** Lets all your targets go; false if you had none. */
  clear(): boolean {
    if (this.mine.size === 0) return false;
    this.mine.clear();
    this.tell();
    return true;
  }

  /** Your target, when you have exactly one. */
  only(): string | undefined {
    return this.mine.size === 1 ? [...this.mine][0] : undefined;
  }

  /** Whether anyone targets anything. */
  any(): boolean {
    return this.mine.size > 0 || this.others.size > 0;
  }

  /** Who targets token `id`: you first, then the others. */
  on(id: string): Targeter[] {
    const out: Targeter[] = [];
    const you = this.hooks.you();
    if (you && this.mine.has(id)) out.push({ player: you.id, name: you.name, color: you.color });
    for (const { tokens, ...who } of this.others.values()) if (tokens.has(id)) out.push(who);
    return out;
  }

  /** Someone else changed their targets. */
  receive({ player, name, color, tokens }: TargetNews): void {
    if (tokens.length) this.others.set(player, { player, name, color, tokens: new Set(tokens) });
    else this.others.delete(player);
    this.hooks.changed();
  }

  /** Token `id` went out of sight or was removed: nobody's target shows on it. */
  forget(id: string): void {
    this.mine.delete(id);
    for (const o of this.others.values()) o.tokens.delete(id);
  }

  /**
   * Starting over (a new welcome): the others' targets come again, and yours
   * that are still in sight (`keep`) go to the server again.
   */
  reset(keep: (id: string) => boolean): void {
    this.others.clear();
    for (const id of this.mine) if (!keep(id)) this.mine.delete(id);
    if (this.mine.size) this.tell();
    else this.hooks.changed();
  }

  private tell(): void {
    this.hooks.send({ t: 'target', tokens: [...this.mine] });
    this.hooks.changed();
  }
}
