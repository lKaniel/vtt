import { createHash, randomBytes } from 'node:crypto';
import type { GameIndex } from './game-index.ts';
import { checkSecret, type Hashed, hashSecret } from '../http/secrets.ts';

// What opens a game's players, besides the game folder: each player's
// password (picked on the join screen) and each player's key for Claude
// (mcp-http.ts). Kept in the server's games.json (game-index.ts), so copying a
// game folder to another server doesn't copy them.

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export class GameAccess {
  constructor(private index: GameIndex) {}

  /** Puts a password on a player, or (null) takes it off. */
  async setPassword(game: string, player: string, password: string | null): Promise<void> {
    const { [player]: _old, ...rest } = this.index.get(game).seatKeys ?? {};
    const keys = password ? { ...rest, [player]: await hashSecret(password) } : rest;
    await this.index.set(game, { seatKeys: keys });
  }

  /** Gives a player an already hashed password (an old account's, migrate-accounts.ts), unless it has one. */
  async adoptPassword(game: string, player: string, hashed: Hashed): Promise<void> {
    const keys = this.index.get(game).seatKeys ?? {};
    if (!keys[player]) await this.index.set(game, { seatKeys: { ...keys, [player]: hashed } });
  }

  /** Gives a player an already hashed Claude key (an old account's), unless it has one. */
  async adoptMcpKey(game: string, player: string, hash: string): Promise<void> {
    const keys = this.index.get(game).mcpKeys ?? {};
    if (!keys[player]) await this.index.set(game, { mcpKeys: { ...keys, [player]: hash } });
  }

  /** The players with a password. */
  locked(game: string): string[] {
    return Object.keys(this.index.get(game).seatKeys ?? {});
  }

  /** Whether `password` opens the player: anything does when it has none. */
  async opens(game: string, player: string, password: string | null): Promise<boolean> {
    const hashed = this.index.get(game).seatKeys?.[player];
    return !hashed || (password !== null && (await checkSecret(password, hashed)));
  }

  /** A removed player's password and Claude key go with them. */
  async forget(game: string, player: string): Promise<void> {
    const entry = this.index.get(game);
    const { [player]: _key, ...seatKeys } = entry.seatKeys ?? {};
    const { [player]: _mcp, ...mcpKeys } = entry.mcpKeys ?? {};
    await this.index.set(game, { seatKeys, mcpKeys });
  }

  /** A new key for Claude to sit as `player` with; it replaces the old one. Shown once. */
  async newMcpKey(game: string, player: string): Promise<string> {
    const key = `vtt_${randomBytes(24).toString('base64url')}`;
    await this.index.set(game, { mcpKeys: { ...this.index.get(game).mcpKeys, [player]: sha256(key) } });
    return key;
  }

  async dropMcpKey(game: string, player: string): Promise<void> {
    const { [player]: _gone, ...rest } = this.index.get(game).mcpKeys ?? {};
    await this.index.set(game, { mcpKeys: rest });
  }

  hasMcpKey(game: string, player: string): boolean {
    return !!this.index.get(game).mcpKeys?.[player];
  }

  /** The game and player a Claude key sits as. */
  mcpSeat(key: string): { game: string; player: string } | undefined {
    const hash = sha256(key);
    for (const [game, entry] of this.index.all()) {
      const player = Object.entries(entry.mcpKeys ?? {}).find(([, h]) => h === hash)?.[0];
      if (player) return { game, player };
    }
    return undefined;
  }
}
