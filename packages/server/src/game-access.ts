import type { Account } from './accounts.ts';
import type { GameIndex, IndexEntry } from './game-index.ts';
import { checkSecret, hashSecret } from './secrets.ts';

// Who gets into a game besides its members: join requests the GM approves
// (when the game asks for approval), and passwords on fixed seats, the ones
// taken without an account. Kept in the server's games.json (game-index.ts).

export type JoinRequest = NonNullable<IndexEntry['requests']>[number];

export class GameAccess {
  constructor(private index: GameIndex) {}

  /** Whether joining asks the GM first. */
  needsApproval(game: string): boolean {
    return !!this.index.get(game).approval;
  }

  setApproval(game: string, approval: boolean): Promise<void> {
    return this.index.set(game, { approval });
  }

  requests(game: string): JoinRequest[] {
    return this.index.get(game).requests ?? [];
  }

  /** The account asks to join (once). */
  async request(game: string, account: Account): Promise<void> {
    const waiting = this.requests(game);
    if (waiting.some((r) => r.id === account.id)) return;
    await this.index.set(game, { requests: [...waiting, { id: account.id, name: account.name, at: Date.now() }] });
  }

  /** Takes an account's request off the list; undefined if it had none. */
  async answer(game: string, account: string): Promise<JoinRequest | undefined> {
    const waiting = this.requests(game);
    const found = waiting.find((r) => r.id === account);
    if (found) await this.index.set(game, { requests: waiting.filter((r) => r !== found) });
    return found;
  }

  /** Puts a password on a seat, or (null) takes it off. */
  async setSeatKey(game: string, seat: string, password: string | null): Promise<void> {
    const { [seat]: _old, ...rest } = this.index.get(game).seatKeys ?? {};
    const keys = password ? { ...rest, [seat]: await hashSecret(password) } : rest;
    await this.index.set(game, { seatKeys: keys });
  }

  /** The seats with a password. */
  lockedSeats(game: string): string[] {
    return Object.keys(this.index.get(game).seatKeys ?? {});
  }

  /** Whether `key` opens the seat: any key does when it has no password. */
  async opens(game: string, seat: string, key: string | null): Promise<boolean> {
    const hashed = this.index.get(game).seatKeys?.[seat];
    return !hashed || (key !== null && (await checkSecret(key, hashed)));
  }
}
